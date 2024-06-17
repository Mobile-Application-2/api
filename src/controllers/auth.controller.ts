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
import {delete_file, upload_file} from '../utils/cloudinary';
import send_mail from '../utils/nodemailer';
import {customJwtPayload} from '../interfaces/jwt-payload';
import IResetPassword from '../interfaces/reset-password';
import NOTIFICATION from '../models/notification.model';
import {send_OTP, verify_OTP} from '../utils/twilio';

async function generate_otp_token(email: string) {
  // the * 10 ^ 8 feels useless but it's important as it makes sure the number will not start with 0
  const token = (Math.random() * Math.pow(10, 8))
    .toString()
    .replace('.', '')
    .slice(0, 6);

  await redisClient.set(token, email, {EX: 60 * 5});

  return token;
}

async function create_tokens(userId: string, isCelebrity = false) {
  const tokenId = uuidv4();

  await redisClient.set(tokenId, userId, {EX: 60 * 60 * 24 * 60}); // 60 days

  const accessToken = jwt.sign(
    {userId, isCelebrity},
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

          // inform the referrer that someone signed up with thier code
          await NOTIFICATION.create(
            [
              {
                title: 'Referral Notification',
                body: `${userInfo.username} just joined skyboard using your referral code/link`,
                image: process.env.SKYBOARD_LOGO as string,
                userId: referralCode,
              },
            ],
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

export async function register_celebrity(req: Request, res: Response) {
  try {
    const userInfo = req.body;

    if (typeof userInfo !== 'object' || Object.keys(userInfo).length === 0) {
      res.status(400).json({message: 'Invalid request'});
      return;
    }

    const allowedFields = [
      'email',
      'password',
      'phoneNumber',
      'socialMediaPlatform',
      'socialMediaHandle',
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

    // update to account for username and isCelebrity
    userInfo['username'] = userInfo['socialMediaHandle'];
    userInfo['isCelebrity'] = true;

    // insert the user
    const insertInfo = await USER.create(userInfo);

    const tokens = await create_tokens(insertInfo._id.toString(), true);

    res.status(201).json({message: 'Registration successful', data: tokens});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function login(req: Request, res: Response) {
  try {
    const {email, password, otp} = req.body;

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

    if (user.twoFactorAuthenticationEnabled) {
      const medium = user.twoFactorAuthenticationProvider;

      // send them the otp
      if (otp === undefined) {
        if (medium === 'phone') {
          await send_OTP(user.phoneNumber, 'sms');
        } else if (medium === 'email') {
          const token = await generate_otp_token(user.email);

          await send_mail(
            user.email,
            'email-verification',
            'Verify Your 2FA Method',
            {email: user.email, token}
          );
        }

        res.status(202).json({
          message: `Please proceed with 2FA, a code has been sent to your ${medium}`,
        });
        return;
      }

      // verify the otp
      if (medium === 'phone') {
        const response = await verify_OTP(user.phoneNumber, otp);

        if (response.status !== 'approved') {
          res.status(401).json({message: 'Invalid OTP'});
          return;
        }
      } else if (medium === 'email') {
        const response = await redisClient.get(otp);

        if (response !== user.email) {
          res.status(401).json({message: 'Invalid OTP'});
          return;
        }

        await redisClient.del(otp);
      }
    }

    const tokens = await create_tokens(user._id.toString());

    res.status(200).json({message: 'Login successful', data: {tokens, user}});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function refresh_tokens(req: Request, res: Response) {
  try {
    const refreshToken = req.headers.authorization?.split(' ')[1];

    if (refreshToken === undefined || refreshToken.length === 0) {
      res.status(401).json({message: 'Invalid token'});
      return;
    }

    // verify token integrity
    const tokenInfo = jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET as string
    ) as customJwtPayload;

    // check that token has not been used before
    const userId = await redisClient.get(tokenInfo.tokenId);

    if (userId === null) {
      res.status(401).json({message: 'Invalid token'});
      return;
    }

    // check if the user is a creator
    const userInfo = await USER.findOne({_id: userId});

    if (userInfo === null) {
      res.status(401).json({message: 'Access Denied'});
      return;
    }

    // create new tokens
    const tokens = await create_tokens(userId);

    // delete redis entry
    await redisClient.del(tokenInfo.tokenId);

    res.status(200).json({
      message: 'Token refreshed successfully',
      tokens,
    });
  } catch (error) {
    console.log(error);
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
      // delete old avatar
      const userInfo = await USER.findOne({_id: userId});

      if (userInfo === null) {
        res.status(400).json({
          message: 'Something went wrong while updating your profile',
        });
        return;
      }

      // NOTE: might need to handle default avatar exception
      if (userInfo.avatar) {
        await delete_file(userInfo.avatar, 'profile');
      }

      req.body['avatar'] = await upload_file(req.body['avatar'], 'profile');
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

export async function send_email_otp(req: Request, res: Response) {
  try {
    const {email} = req.body;

    if (email === undefined || email.length === 0 || isEmail(email) === false) {
      res.status(400).json({message: 'Invalid request'});
      return;
    }

    // check that email is registered with us
    const emailExists = await USER.findOne({email});

    if (emailExists === null) {
      res.status(200).json({
        message:
          'An OTP will be sent if this email is registered with skyboard',
      });
      return;
    }

    // the * 10 ^ 8 feels useless but it's important as it makes sure the number will not start with 0
    const token = (Math.random() * Math.pow(10, 8))
      .toString()
      .replace('.', '')
      .slice(0, 6);

    await redisClient.set(token, email, {EX: 60 * 5});

    await send_mail(email, 'email-verification', 'Verify Email Address', {
      email,
      token,
    });

    res.status(200).json({
      message: 'An OTP will be sent if this email is registered with skyboard',
    });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function verify_email_otp(req: Request, res: Response) {
  try {
    const {otp, email, purpose} = req.body;

    if (otp === undefined || otp.length !== 6) {
      res
        .status(400)
        .json({message: 'Please enter the OTP sent to your email'});
      return;
    }

    if (email === undefined || email.length === 0 || isEmail(email) === false) {
      res.status(400).json({message: 'Invalid request'});
      return;
    }

    const response = await redisClient.get(otp);

    if (response !== email) {
      res.status(400).json({message: 'Invalid OTP'});
      return;
    }

    // no matter the purpose, we will always verify the email
    const update: any = {emailIsVerified: true};

    if (purpose === '2fa-setup') {
      update['twoFactorAuthenticationEnabled'] = true;
      update['twoFactorAuthenticationProvider'] = 'email';
    }

    await USER.updateOne({email}, update);

    await redisClient.del(otp);

    res.status(200).json({message: 'OTP verified successfully'});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function send_sms_otp(req: Request, res: Response) {
  try {
    const {phone} = req.body;

    if (
      phone === undefined ||
      phone.length === 0 ||
      isMobilePhone(phone, 'en-NG') === false ||
      phone.startsWith('+234') === false
    ) {
      res
        .status(400)
        .json({message: 'Please enter a valid Nigerian phone number (+234)'});
      return;
    }

    // check that phone is a registered one
    const phoneExists = await USER.findOne({phoneNumber: phone});

    if (phoneExists === null) {
      res.status(200).json({
        message:
          'An OTP will be sent if this phone number is registered with skyboard',
      });
      return;
    }

    await send_OTP(phone, 'sms');

    res.status(200).json({
      message:
        'An OTP will be sent if this phone number is registered with skyboard',
    });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function verify_sms_otp(req: Request, res: Response) {
  try {
    const {otp, phone, purpose} = req.body;

    if (otp === undefined || otp.length !== 4) {
      res
        .status(400)
        .json({message: 'Please enter the OTP sent to your phone'});
      return;
    }

    if (
      phone === undefined ||
      phone.length === 0 ||
      isMobilePhone(phone, 'en-NG') === false ||
      phone.startsWith('+234') === false
    ) {
      res
        .status(400)
        .json({message: 'Please enter a valid Nigerian phone number (+234)'});
      return;
    }

    const response = await verify_OTP(phone, otp);

    if (response.status !== 'approved') {
      res.status(400).json({message: 'Invalid OTP'});
      return;
    }

    const update: any = {phoneNumberIsVerified: true};

    if (purpose === '2fa-setup') {
      update['twoFactorAuthenticationEnabled'] = true;
      update['twoFactorAuthenticationProvider'] = 'phone';
    }

    await USER.updateOne({phoneNumber: phone}, update);

    res.status(200).json({message: 'OTP verified successfully'});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function change_password(req: Request, res: Response) {
  try {
    const {userId} = req;
    const {oldPassword, newPassword} = req.body;

    const user = await USER.findOne({_id: userId});

    if (user === null) {
      res
        .status(400)
        .json({message: 'It appears this user account no longer exists'});
      return;
    }

    if (oldPassword === undefined || oldPassword.length === 0) {
      res.status(400).json({message: 'Please enter your old password'});
      return;
    }

    if (newPassword === undefined || newPassword.length === 0) {
      res.status(400).json({message: 'Please enter your new password'});
      return;
    }

    const hasCorrectOldPassword = bcrypt.compareSync(
      oldPassword,
      user.password
    );

    if (hasCorrectOldPassword === false) {
      res.status(400).json({message: 'Incorrect old password'});
      return;
    }

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(newPassword, salt);

    const updateInfo = await USER.updateOne(
      {_id: userId},
      {password: hashedPassword}
    );

    if (updateInfo.modifiedCount === 0) {
      res
        .status(400)
        .json({message: 'It appears this user account no longer exists'});
      return;
    }

    res.status(200).json({message: 'Password updated successfully'});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function send_reset_password_email(req: Request, res: Response) {
  try {
    const {email} = req.body;

    if (email === undefined || email.length === 0 || isEmail(email) === false) {
      res.status(400).json({message: 'Invalid request'});
      return;
    }

    const userExists = await USER.findOne({email});

    if (userExists === null) {
      res.status(200).json({
        message: `An email will be sent to ${email}, if it is a registered account`,
      });
      return;
    }

    const token = await generate_otp_token(email);

    const payload: IResetPassword = {
      token,
      email,
      ip: req.ip,
    };

    await send_mail(email, 'reset-password', 'Reset Your Password', payload);

    res.status(200).json({
      message: `An email will be sent to ${email}, if it is a registered account`,
    });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function reset_password(req: Request, res: Response) {
  try {
    const {email, token, newPassword} = req.body;

    if (email === undefined || email.length === 0 || isEmail(email) === false) {
      res.status(400).json({message: 'Invalid request'});
      return;
    }

    if (token === undefined || token.length === 0) {
      res.status(400).json({message: 'Invalid request'});
      return;
    }

    if (newPassword === undefined || newPassword.length === 0) {
      res.status(400).json({message: 'Invalid request'});
      return;
    }

    const tokenInfo = await redisClient.get(token);

    if (tokenInfo !== email) {
      res.status(400).json({message: 'Invalid token'});
      return;
    }

    await redisClient.del(token);

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(newPassword, salt);

    const updateInfo = await USER.updateOne(
      {email},
      {password: hashedPassword}
    );

    if (updateInfo.modifiedCount === 0) {
      res
        .status(400)
        .json({message: 'It appears this user account no longer exists'});
      return;
    }

    res.status(200).json({message: 'Password updated successfully'});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function begin_2fa_process(req: Request, res: Response) {
  try {
    const {userId} = req;
    const {method} = req.body;

    const allowedMethods = ['phone', 'email'];
    if (!allowedMethods.includes(method)) {
      res
        .status(400)
        .json({message: 'Please select a valid 2FA method (sms or email)'});
      return;
    }

    const userInfo = await USER.findOne({_id: userId});

    if (userInfo === null) {
      res.status(400).json({
        message: 'Something went wrong try logging back into you account again',
      });
      return;
    }

    console.log(
      userInfo.twoFactorAuthenticationEnabled,
      method,
      userInfo.twoFactorAuthenticationProvider
    );

    if (
      userInfo.twoFactorAuthenticationEnabled &&
      userInfo.twoFactorAuthenticationProvider === method
    ) {
      res
        .status(400)
        .json({message: `You already have 2FA enabled via ${method}`});
      return;
    }

    // send either email or sms depending on method, then use the purpose to update the model
    let successMessage = '';

    if (method === 'sms') {
      await send_OTP(userInfo.phoneNumber, 'sms');

      const obfuscatedPhone =
        userInfo.phoneNumber.slice(0, 4) +
        '****' +
        userInfo.phoneNumber.slice(-2);
      successMessage = `An OTP will be sent to your phone number (${obfuscatedPhone})`;
    } else if (method === 'email') {
      const token = await generate_otp_token(userInfo.email);

      await send_mail(
        userInfo.email,
        'email-verification',
        'Verify Your 2FA Method',
        {email: userInfo.email, token}
      );

      const obfuscatedEmail = userInfo.email.slice(0, 5) + '****';
      successMessage = `An OTP will be sent to your email address beginning with (${obfuscatedEmail})`;
    }

    res.status(200).json({message: successMessage});
  } catch (error) {
    handle_error(error, res);
  }
}
