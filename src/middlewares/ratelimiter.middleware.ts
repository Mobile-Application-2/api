import rateLimit from 'express-rate-limit';

export const rate_limit_api = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV !== 'production' ? 10000 : 1000, // max request per hour
});

export const rate_limit_verification = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV !== 'production' ? 10000 : 2, // max request per minute
});

export const rate_limit_auth = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV !== 'production' ? 10000 : 10, // max request per minute
});

export const rate_limit_payment = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV !== 'production' ? 10000 : 5, // max request per minute
});
