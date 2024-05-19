import {NextFunction, Request, Response} from 'express';
import jwt from 'jsonwebtoken';
import {isValidObjectId} from 'mongoose';

export function process_token(token: string | undefined) {
  if (typeof token === 'undefined' || token.length === 0) {
    throw Error('Access Denied');
  }

  const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET as string);

  const {userId} = decoded as {userId: string};

  if (!isValidObjectId(userId)) {
    throw Error('Access Denied');
  }

  return userId;
}

export function is_logged_in(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    const userId = process_token(token as string);

    req.userId = userId;

    next();
  } catch (error) {
    // sentry already captures all errors;
    res.status(401).json({message: 'Access Denied'});
  }
}
