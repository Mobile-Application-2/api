import axios from 'axios';
import { BanksResponse } from '../interfaces/banks';
import { AccountDetails } from '../interfaces/account-details';
import USER from '../models/user.model';

const PAYSTACK_SECRET_KEY =
  process.env.NODE_ENV === 'production'
    ? process.env.PAYSTACK_SECRET_KEY
    : process.env.PAYSTACK_SECRET_KEY_DEV;

export async function create_checkout_url(
  email: string,
  reference: string,
  amountToPay: number,
  channels?: string[]
) {
  // create a checkout URL from paystack
  const initializeData = {
    email,
    reference,
    amount: amountToPay,
    callback_url: process.env.PAYSTACK_CALLBACK_URL,
    channels,
  };
  const resp = await axios.post(
    process.env.PAYSTACK_INITIALIZE_ENDPOINT as string,
    initializeData,
    {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return resp.data.data.authorization_url;
}

export async function fetch_banks(): Promise<BanksResponse> {
  const resp = await axios.get(
    `${process.env.PAYSTACK_BASE_API}/bank?country=nigeria`,
    {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const data = (await resp.data) as BanksResponse;

  return data;
}

export async function fetch_account_details(
  accountNumber: string,
  bank: string,
  userId: string | undefined
): Promise<AccountDetails | null> {
  // const resp = await axios.get(
  //   `${process.env.PAYSTACK_BASE_API}/bank/resolve?account_number=${accountNumber}&bank_code=${bank}`,
  //   {
  //     headers: {
  //       Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
  //       'Content-Type': 'application/json',
  //     },
  //   }
  // );

  // const data = (await resp.data) as AccountDetails;

  if(!userId) return null;

  const user = await USER.findOne({ _id: userId, account_number: accountNumber });

  if(!user) return null;

  if(user.account_name && user.account_number && user.bank_name) {
    return {
      data: {
        account_name: user.account_name,
        account_number: user.account_number,
        bank_name: user.bank_name
      },
      message: "success",
      status: true,
    } satisfies AccountDetails ;
  }
  else {
    return null
  }

}

export const calculate_charge = function (amount: number) {
  let charge = 0;

  // charge from paystack @ https://paystack.com/pricing?localeUpdate=true
  if (amount <= 5_000) {
    charge = 10;
  } else if (amount <= 50_000) {
    charge = 25;
  } else {
    charge = 50;
  }

  return charge * 100; // paystack uses kobo
};
