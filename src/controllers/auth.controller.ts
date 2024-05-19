import {Request, Response} from 'express';
import {handle_error} from '../utils/handle-error';
import USER from '../models/user.model';
import {v4 as uuidv4} from 'uuid';
import jwt from 'jsonwebtoken';
import redisClient from '../utils/redis';
import REFERRAL from '../models/referral.model';
import mongoose from 'mongoose';
import {isEmail, isMobilePhone} from 'validator';
import bcrypt from 'bcrypt';
import {upload_file} from '../utils/cloudinary';

async function create_tokens(userId: string) {
  const tokenId = uuidv4();

  await redisClient.set(tokenId, userId, {EX: 60 * 60 * 24 * 60}); // 60 days

  const accessToken = jwt.sign(
    {userId},
    process.env.ACCESS_TOKEN_SECRET as string,
    {expiresIn: '15m'}
  );
  const refreshToken = jwt.sign(
    {tokenId, userId},
    process.env.REFRESH_TOKEN_SECRET as string,
    {expiresIn: '60d'}
  );

  return {accessToken, refreshToken};
}

export async function register_user(req: Request, res: Response) {
  try {
    const userInfo = req.body;

    if (typeof userInfo !== 'object' || Object.keys(userInfo).length === 0) {
      res.status(400).json({message: 'Invalid request'});
      return;
    }

    // remove and account for referral information
    const referralCode = userInfo.referralCode;
    delete userInfo.referralCode;

    const allowedFields = [
      'username',
      'email',
      'password',
      'dob',
      'phoneNumber',
    ];
    const fieldsFromRequest = Object.keys(userInfo);

    const hasOnlyAllowedFields = fieldsFromRequest.every(field =>
      allowedFields.includes(field)
    );
    const hasAllAllowedFields = allowedFields.every(field =>
      fieldsFromRequest.includes(field)
    );

    if (!hasAllAllowedFields || !hasOnlyAllowedFields) {
      res.status(400).json({
        message:
          'Invalid request, ensure all and only required fields are specified',
      });
      return;
    }

    const session = await mongoose.startSession({
      defaultTransactionOptions: {
        writeConcern: {w: 1},
        readConcern: {level: 'local'},
      },
    });

    await session.withTransaction(async session => {
      try {
        const insertInfo = await USER.create([userInfo], {session});

        const tokens = await create_tokens(insertInfo[0]._id.toString());

        // account for referral
        if (referralCode) {
          await REFERRAL.create(
            [{referred: insertInfo[0]._id, referrer: referralCode}],
            {session}
          );
        }

        await session.commitTransaction();

        res
          .status(201)
          .json({message: 'Registration successful', data: tokens});
      } catch (error) {
        await session.abortTransaction();

        throw error;
      } finally {
        await session.endSession();
      }
    });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function login(req: Request, res: Response) {
  try {
    const {email, password} = req.body;

    if (email === undefined || email.length === 0 || isEmail(email) === false) {
      res.status(401).json({message: 'Invalid credentials'});
      return;
    }

    if (password === undefined || password.length === 0) {
      res.status(401).json({message: 'Invalid credentials'});
      return;
    }

    const user = await USER.findOne({email});

    if (user === null) {
      res.status(401).json({message: 'Invalid credentials'});
      return;
    }

    const passwordMatches = bcrypt.compareSync(password, user.password);

    if (passwordMatches === false) {
      res.status(401).json({message: 'Invalid credentials'});
      return;
    }

    const tokens = await create_tokens(user._id.toString());

    res.status(200).json({message: 'Login successful', data: tokens});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function get_my_profile(req: Request, res: Response) {
  try {
    const {userId} = req;

    const userInfo = await USER.findOne(
      {_id: userId},
      {password: 0, updatedAt: 0}
    );

    // user's auth status should be invalidated, something is wrong
    if (userInfo === null) {
      res.status(400).json({
        message:
          'Something went wrong while fetching your profile, please log back into your account to continue',
      });
      return;
    }

    res
      .status(200)
      .json({message: 'Profile information retrieved', data: userInfo});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function edit_profile(req: Request, res: Response) {
  try {
    const {userId} = req;
    const update = req.body;

    if (update === undefined || Object.keys(update).length === 0) {
      res.status(400).json({message: 'Invalid request'});
      return;
    }

    const fieldsFromUpdate = Object.keys(update);
    const validFields = [
      'username',
      'phoneNumber',
      'bio',
      'avatar',
      'notificationPreferences',
    ];

    const hasInvalidFields = fieldsFromUpdate.some(
      field => validFields.includes(field) === false
    );

    if (hasInvalidFields) {
      res
        .status(400)
        .json({message: 'Update failed as request contains invalid fields'});
      return;
    }

    // enforce username uniqueness
    if (Object.prototype.hasOwnProperty.call(update, 'username') !== false) {
      const usernameExists = await USER.findOne({username: update.username});

      if (usernameExists && usernameExists._id.toString() === userId) {
        res.status(400).json({
          message: `Please specify a new username, ${update.username} already belongs to you`,
        });
        return;
      }

      if (usernameExists) {
        res.status(400).json({
          message: `The username ${update.username} is not available, please try another`,
        });
        return;
      }
    }

    // validate the notification preferences
    if (
      Object.prototype.hasOwnProperty.call(update, 'notificationPreferences')
    ) {
      const validNotificationPreferences = ['pushNotification', 'email'];
      const fieldsFromNotificationPreferences = Object.keys(
        update.notificationPreferences
      );

      const hasInvalidNotificationPreferences =
        fieldsFromNotificationPreferences.some(
          field => validNotificationPreferences.includes(field) === false
        );

      if (hasInvalidNotificationPreferences) {
        res.status(400).json({
          message:
            'Update failed as request contains invalid notification preferences',
        });
        return;
      }
    }

    // check for presence of phone
    if (Object.prototype.hasOwnProperty.call(update, 'phoneNumber')) {
      if (isMobilePhone(update.phoneNumber, 'en-NG') === false) {
        res.status(400).json({
          message:
            'Update failed, phone number must be a valid Nigerian phone number (+234, 08..., 07... etc.)',
        });
        return;
      }

      const userWithPhone = await USER.findOne({
        phoneNumber: update.phoneNumber,
      });

      if (userWithPhone !== null) {
        res.status(400).json({
          message: `The phone number ${update.phoneNumber} is not available`,
        });
        return;
      }

      // toggle the phoneIsVerified field back to false
      update['phoneNumberIsVerified'] = false;
    }

    // process avatar upload to cloud storage
    if (Object.prototype.hasOwnProperty.call(update, 'avatar')) {
      req.body['avatar'] = await upload_file(req.body['avatar']);
    }

    const updateInfo = await USER.updateOne({_id: userId}, update);

    if (updateInfo.modifiedCount === 0) {
      res
        .status(400)
        .json({message: 'It appears this user account no longer exists'});
      return;
    }

    res.status(200).json({message: 'Profile updated successfully'});
  } catch (error) {
    handle_error(error, res);
  }
}
