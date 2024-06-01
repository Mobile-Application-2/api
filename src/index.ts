import {config} from 'dotenv';
config();

import * as Sentry from '@sentry/node';
import {nodeProfilingIntegration} from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN_DEV,
  integrations: [nodeProfilingIntegration()],
  // Performance Monitoring
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  // Set sampling rate for profiling - this is relative to tracesSampleRate
  profilesSampleRate: 1.0,
});

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import mongoose from 'mongoose';
import generalRoutes from './routes/general.routes';
import redisClient from './utils/redis';
import responseBool from './middlewares/response-bool.middleware';
import fileUpload from 'express-fileupload';
import {Server} from 'socket.io';
import {createServer} from 'node:http';
import {is_authorized_socket} from './middlewares/auth.middleware';
import {
  handle_message_read,
  handle_message_received,
  handle_socket_disconnection,
  send_message,
} from './controllers/messaging.controller';

const app = express();
app.use(cors());
app.use(express.json());
app.use(compression());
app.use(
  fileUpload({
    abortOnLimit: true,
    safeFileNames: true,
    preserveExtension: true,
    responseOnLimit: 'Max file size is 25mb',
    limits: {
      fileSize: 25 * 1024 * 1024, // 25mb
    },
  })
);

// overwrites the returned JSON to include boolean status
app.use(responseBool);

const PORT = process.env.PORT || 5656;
const DB_URI =
  process.env.NODE_ENV === 'production'
    ? process.env.DB_URI
    : process.env.DEV_DB_URI;

async function main() {
  console.log('Connecting to DB');
  await mongoose.connect(DB_URI as string);
  console.log('DB connection established');

  console.log('Connecting to Redis...');
  await redisClient.connect();
  console.log('Connected to Redis');

  console.log('Creating Web Socket Server...');
  const httpServer = createServer(app);
  const io = new Server(httpServer);
  console.log(`Created Web Socket Server on port ${PORT}`);

  // holds an object with functions for each type of event
  const eventsAndHandlers = {
    disconnect: handle_socket_disconnection,
    new_message: send_message,
    message_received: handle_message_received,
    message_read: handle_message_read,
    game_message: () => {},
  };

  io.on('connection', async socket => {
    if ((await is_authorized_socket(socket)) === false) {
      socket.emit('access_denied', 'Access Token is either Expired or Invalid');
      socket.disconnect(true);
      return;
    }

    const events = Object.keys(
      eventsAndHandlers
    ) as (keyof typeof eventsAndHandlers)[];

    events.forEach(event => {
      socket.on(event, (args: any) =>
        eventsAndHandlers[event](socket, io, args)
      );
    });
  });

  app.use('', generalRoutes);

  app.get('*', (_, res) => {
    res.status(404).json({message: 'Route not found'});
  });

  // The error handler must be registered before any other error middleware and after all controllers
  Sentry.setupExpressErrorHandler(app);

  httpServer.listen(PORT, () => console.log('App is now running'));
}

main().catch(console.error);
