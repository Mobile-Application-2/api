import {NextFunction, Request, Response} from 'express';
import jwt from 'jsonwebtoken';
import {isValidObjectId} from 'mongoose';
import {Socket} from 'socket.io';
import redisClient from '../utils/redis';
import crypto from 'node:crypto';

export function process_token(token: string | undefined) {
  if (typeof token === 'undefined' || token.length === 0) {
    throw Error('Access Denied');
  }

  const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET as string);

  const {userId, isCelebrity} = decoded as {
    userId: string;
    isCelebrity: string;
  };

  if (!isValidObjectId(userId)) {
    throw Error('Access Denied');
  }

  return {userId, isCelebrity};
}

export function is_logged_in(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    const {userId} = process_token(token as string);

    req.userId = userId;

    next();
  } catch (error) {
    // sentry already captures all errors;
    res.status(401).json({message: 'Access Denied'});
  }
}

export function is_celebrity(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    const {userId, isCelebrity} = process_token(token as string);

    req.userId = userId;
    req.isCelebrity = isCelebrity;

    next();
  } catch (error) {
    // sentry already captures all errors;
    res.status(401).json({message: 'Access Denied'});
  }
}

export async function is_authorized_socket(socket: Socket): Promise<Boolean> {
  try {
    const token = socket.handshake.headers.authorization?.split(' ')[1];

    const {userId} = process_token(token as string);

    // cache id in redis (used to know who sent a message)
    await redisClient.set(socket.id, userId);
    await redisClient.set(userId + '_messaging', socket.id);

    return true;
  } catch (error) {
    return false;
  }
}

export async function is_game_server(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = req.body;
    const hash = req.headers['skyboard-request-hash'];

    if (typeof data !== 'object' || !hash) {
      res.status(401).json({message: 'Access Denied'});
      return;
    }

    // rehash and compare
    const calculatedHash = crypto
      .createHmac('sha512', process.env.GAME_SERVER_KEY as string)
      .update(JSON.stringify(data, null, 0))
      .digest('hex');

    if (hash !== calculatedHash) {
      res.status(401).json({message: 'Access Denied'});
      return;
    }

    next();
  } catch (error) {
    // sentry already captures all errors;
    res.status(401).json({message: 'Access Denied'});
  }
}
