import redisClient from './redis';

export default async function generate_otp_token(email: string) {
  // the * 10 ^ 8 feels useless but it's important as it makes sure the number will not start with 0
  const token = (Math.random() * Math.pow(10, 8))
    .toString()
    .replace('.', '')
    .slice(0, 6);

  await redisClient.set(token, email, {EX: 60 * 5});

  return token;
}
