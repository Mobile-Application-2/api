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

import amqplib from 'amqplib';
import {
  handle_game_won,
  send_tournament_start_notification,
} from './controllers/queue.controller';
import mongoose from 'mongoose';

const DB_URI =
  process.env.NODE_ENV === 'production'
    ? process.env.DB_URI
    : process.env.DEV_DB_URI;

async function main(tries = 0) {
  try {
    console.log('Connecting to DB from queue consumer...');
    await mongoose.connect(DB_URI as string);
    console.log('DB connection established from queue consumer');

    console.log('Connecting to RabbitMQ...');
    const connection = await amqplib.connect(
      process.env.RABBITMQ_URL as string
    );
    const channel = await connection.createChannel();
    console.log('Connected to RabbitMQ');

    const queuesAndHandlers = {
      'game-info-win': handle_game_won,
      'tournament-started-notification': send_tournament_start_notification,
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
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED' && tries < 10) {
      setTimeout(() => main(tries + 1), 1500);
      return;
    }

    Sentry.captureException(error, {
      level: 'fatal',
      tags: {source: 'RabbitMQ initialization on queue consumer'},
    });

    throw error;
  }
}

main();
