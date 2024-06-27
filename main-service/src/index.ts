import {config} from 'dotenv';
config();

import * as Sentry from '@sentry/node';
import {nodeProfilingIntegration} from '@sentry/profiling-node';

Sentry.init({
  environment: process.env.NODE_ENV,
  dsn: process.env.SENTRY_DSN_DEV,
  integrations: [nodeProfilingIntegration()],
  // Performance Monitoring
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  // Set sampling rate for profiling - this is relative to tracesSampleRate
  profilesSampleRate: 1.0,
});

import express, {Request, Response} from 'express';
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
import path from 'node:path';
import {rate_limit_api} from './middlewares/ratelimiter.middleware';
import amqplib from 'amqplib';
import {handle_game_won} from './controllers/msg-queue.controller';

const app = express();

// change back to strict
const staticFolderPath = path.join(__dirname, 'static');

// my nginx server
app.set('trust proxy', 1);

app.use(express.static(staticFolderPath));
app.use(cors({origin: '*'}));
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
app.use(rate_limit_api);

// overwrites the returned JSON to include boolean status
app.use(responseBool);

const PORT = 5656;
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

  console.log('Connecting to RabbitMQ...');
  const connection = await amqplib.connect(process.env.RABBITMQ_URL as string);
  const channel = await connection.createChannel();
  console.log('Connected to RabbitMQ');

  // holds an object with functions for each type of event
  const eventsAndHandlers = {
    disconnect: handle_socket_disconnection,
    new_message: send_message,
    message_received: handle_message_received,
    message_read: handle_message_read,
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

  const queuesAndHandlers = {
    'game-info-win': handle_game_won,
  };

  // keyof here is a typescript construct
  const queues = Object.keys(
    queuesAndHandlers
  ) as (keyof typeof queuesAndHandlers)[];

  // register and listen to all queues
  queues.forEach(queue => {
    channel.assertQueue(queue, {durable: true});
    channel.consume(queue, message =>
      queuesAndHandlers[queue](message, channel)
    );
  });

  app.use('/api', generalRoutes);

  // Dynamic route to serve HTML files
  app.get('/:filename', (req: Request, res: Response) => {
    const filename = req.params.filename;
    const filePath = path.join(staticFolderPath, `${filename}.html`);

    res.sendFile(filePath, err => {
      if (err) {
        res.status(404).send('File not found');
      }
    });
  });

  app.all('*', (_, res) => {
    res.status(404).json({message: 'Route not found'});
  });

  // The error handler must be registered before any other error middleware and after all controllers
  Sentry.setupExpressErrorHandler(app);

  httpServer.listen(PORT, () => console.log('App is now running'));
}

main().catch(console.error);
