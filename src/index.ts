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

const app = express();
app.use(cors());
app.use(express.json());
app.use(compression());

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

  app.use('', generalRoutes);

  app.get('*', (_, res) => {
    res.status(404).json({message: 'Route not found'});
  });

  // The error handler must be registered before any other error middleware and after all controllers
  Sentry.setupExpressErrorHandler(app);

  app.listen(PORT, () => console.log('App is now running'));
}

main().catch(console.error);
