import type {Response} from 'express';
import * as Sentry from '@sentry/node';
import {Socket} from 'socket.io';

export function handle_error(error: any, res: Response): void {
  // process error from mongodb schema validation
  if (error.name === 'ValidationError') {
    // get all validation errors
    const validationErrors = Object.values(error.errors).map((err: any) => {
      // identify and parse cast errors
      if (err.name === 'CastError') {
        return `The value ${err.stringValue.replace(
          /"/g,
          "'"
        )} doesn't match the required type for that field`;
      }

      return err.message;
    });

    // send error to client
    res.status(400).json({
      message: 'Bad Request',
      errors: validationErrors,
    });
    return;
  }

  // process error from mongodb duplicate key
  if (error.code === 11000) {
    const duplicateField = Object.keys(error.keyPattern)[0];

    res.status(400).json({message: `${duplicateField} already exists`});
    return;
  }

  if (error.name === 'JsonWebTokenError') {
    res.status(401).json({message: 'Access Denied'});
    return;
  }

  // this particular error won't happen in production as mongoDB will be deployed using a replica set
  if (
    error.toString() ===
    'MongoServerError: Transaction numbers are only allowed on a replica set member or mongos'
  ) {
    console.log(
      '\x1b[31m%s\x1b[0m',
      'Attention Please!!! the last request failed because you are running this application with a standalone mongoDB deployment, please switch to a replica set'
    );

    Sentry.captureMessage(
      'DB Server is running as Standalone, change to replica set',
      'fatal'
    );
  }

  console.log(error);
  res.status(500).json({message: 'Internal Server Error'});
}

export function handle_messaging_error(error: any, socket: Socket) {
  console.log(error);
  socket.emit('error', error.message);
}
