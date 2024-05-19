import {createClient} from 'redis';
import * as Sentry from '@sentry/node';

// Instantiate redis client
const redisClient = createClient({
  url:
    process.env.NODE_ENV === 'production'
      ? process.env.REDIS_URL
      : process.env.REDIS_URL_DEV,
});

redisClient.on('error', error => {
  Sentry.captureException(error, {
    level: 'error',
    tags: {source: 'Redis Client'},
  });
});

export default redisClient;
