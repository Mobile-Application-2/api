import {Request, Response} from 'express';
import {handle_error} from '../utils/handle-error';
import USER from '../models/user.model';
import {v4 as uuidv4} from 'uuid';
import jwt from 'jsonwebtoken';
import redisClient from '../utils/redis';
import REFERRAL from '../models/referral.model';
import mongoose from 'mongoose';

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
