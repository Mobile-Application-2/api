import {createClient} from 'redis';
import * as Sentry from '@sentry/node';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

// Instantiate redis client
const redisClient = createClient({
  url: `redis://${REDIS_HOST}:${REDIS_PORT}`,
});

redisClient.on('error', error => {
  Sentry.captureException(error, {
    level: 'error',
    tags: {source: 'Redis Client'},
  });
});

export default redisClient;
