import twilio from 'twilio';
import {VerificationCheckInstance} from 'twilio/lib/rest/verify/v2/service/verificationCheck';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const serviceId = process.env.TWILIO_VERIFY_SID as string;

const client = twilio(accountSid, authToken);

export const verify_OTP = async function (
  to: string,
  code: string
): Promise<VerificationCheckInstance | {status: string}> {
  try {
    const response = await client.verify.v2
      .services(serviceId)
      .verificationChecks.create({
        to,
        code,
      });
    return response;
  } catch (error: any) {
    // twilio returns 404 when the code is invalid (causing the request to fail) making it hard to distinguish between invalid code and other errors
    // this is a workaround to return a failed status when the code is invalid
    if (error.status === 404) {
      return {status: 'failed'};
    }

    throw error;
  }
};

export const send_OTP = async function (to: string, channel: string) {
  return await client.verify.v2
    .services(serviceId)
    .verifications.create({
      to,
      channel,
    })
    .then(response => response);
};

export const send_SMS = async function (to: string, body: string) {
  return await client.messages.create({
    body,
    to,
    from: process.env.TWILIO_PHONE_NUMBER,
  });
};
