import {Request, Response} from 'express';
import {
  calculate_charge,
  create_checkout_url,
  fetch_account_details,
  fetch_banks,
} from '../utils/paystack';
import {handle_error} from '../utils/handle-error';
import USER from '../models/user.model';
import {v4 as uuidv4} from 'uuid';
import TRANSACTION from '../models/transaction.model';
import TRANSACTIONTTL from '../models/transaction-ttl.model';
import crypto from 'node:crypto';
import * as Sentry from '@sentry/node';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import ITransferRecipient from '../interfaces/transfer-recipient';
import ITransferQueued from '../interfaces/transfer';
import ITransferSuccess from '../interfaces/transfer-success';
import ITransferFailed from '../interfaces/transfer-failed';
import NOTIFICATION from '../models/notification.model';
import send_mail from '../utils/nodemailer';

const PAYSTACK_SECRET_KEY =
  process.env.NODE_ENV === 'production'
    ? process.env.PAYSTACK_SECRET_KEY
    : process.env.PAYSTACK_SECRET_KEY_DEV;

export function handle_callback(_: Request, res: Response) {
  res.status(200).json({message: 'Transaction completed successfully'});
}

export async function get_banks(_: Request, res: Response) {
  try {
    const data = await fetch_banks();

    if (data.status === false) {
      res.status(400).json({message: 'Something went wrong, try again'});
      return;
    }

    const formatted = data.data.map(({name, code, currency, type}) => ({
      name,
      code,
      currency,
      type,
    }));

    res.status(200).json({message: 'Banks retrieved', data: formatted});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function get_user_bank_details(req: Request, res: Response) {
  try {
    const {bank, accountNumber} = req.params;

    if (typeof bank === 'undefined' || typeof accountNumber === 'undefined') {
      res
        .status(400)
        .json({message: 'Please fill in the account number and bank code'});
      return;
    }

    const data = await fetch_account_details(accountNumber, bank);

    if (data.status === false) {
      res.status(400).json({message: data.message});
      return;
    }

    res.status(200).json({message: 'Bank details retrieved', data: data.data});
  } catch (error: any) {
    handle_error(error, res);
  }
}

export async function get_transfer_charge(req: Request, res: Response) {
  try {
    const {amount} = req.params;

    if (isNaN(+amount) || +amount < 1) {
      res.status(400).json({message: 'Please specify a valid amount'});
      return;
    }

    const charge = calculate_charge(+amount);

    res.status(200).json({message: 'Charge retrieved (in Kobo)', data: charge});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function initialize_deposit(req: Request, res: Response) {
  try {
    const {userId} = req;
    let {amount} = req.body;

    amount = +amount;
    if (isNaN(amount)) {
      res.status(400).json({message: 'Please specify a valid amount'});
      return;
    }

    const MIN_DEPOSIT = 500 * 100; // 500 naira in kobo
    if (amount < MIN_DEPOSIT) {
      res.status(400).json({
        message: `Minimum deposit amount is ${MIN_DEPOSIT / 100} naira`,
      });
      return;
    }

    const userInfo = await USER.findOne({_id: userId});

    if (!userInfo) {
      res.status(404).json({
        message:
          'There were some issues with your account, please sign in again',
      });
      return;
    }

    // create a checkout link for this
    const ref = uuidv4();
    const checkoutUrl = await create_checkout_url(userInfo.email, ref, amount);

    const session = await TRANSACTION.startSession({
      defaultTransactionOptions: {
        readConcern: {level: 'majority'},
        writeConcern: {w: 'majority'},
      },
    });

    await session.withTransaction(async session => {
      try {
        // create a transaction record with pending status
        await TRANSACTION.create(
          [
            {
              ref,
              userId,
              amount,
              fee: 0,
              total: amount,
              type: 'deposit',
            },
          ],
          {session}
        );

        // insert a TTL for the transaction (30 minutes)
        await TRANSACTIONTTL.create([{ref}], {session});

        await session.commitTransaction();

        // return checkout link
        res
          .status(200)
          .json({message: 'Checkout link created', data: checkoutUrl});
      } catch (error) {
        await session.abortTransaction();

        throw error;
      } finally {
        await session.endSession();
      }
    });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function handle_webhook(req: Request, res: Response) {
  try {
    console.log(req.body);

    // check that webhook originated from paystack
    const hash = crypto
      .createHmac('sha512', PAYSTACK_SECRET_KEY as string)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      Sentry.addBreadcrumb({
        category: 'webhook',
        data: {
          requestIP: req.ip,
        },
        level: 'warning',
        message:
          "There was an attempt to verify a transaction request that didn't come from paystack",
      });

      Sentry.captureMessage(
        'A forged request to verify a transfer was safely averted',
        'warning'
      );

      res.status(200).end();
      return;
    }

    const {event, data} = req.body;

    console.log(event, data);

    if (event === 'charge.success') {
      const {reference} = data;

      // check if this belongs to a ticket or and account upgrade
      const transactionInfo = await TRANSACTION.findOne({ref: reference});

      if (transactionInfo === null) {
        Sentry.addBreadcrumb({
          category: 'webhook',
          data: {
            transactionRef: reference,
          },
          level: 'warning',
          message:
            "There was an attempt to verify a payment that doesn't exist in the DB",
        });

        Sentry.captureMessage(
          "A transaction webhook came in with a reference that didn't match documents in the DB",
          'warning'
        );
        res.status(200).end();
        return;
      }

      console.log(transactionInfo);
      if (transactionInfo.type === 'deposit') {
        await handle_deposit_success(transactionInfo);
      } else if (event === 'transfer.success') {
        await handle_withdraw_success(data);
      } else if (event === 'transfer.failed' || event === 'transfer.reversed') {
        await handle_withdraw_failure(data);
      }
    }

    res.status(200).end();
  } catch (error) {
    handle_error(error, res);
  }
}

export async function handle_deposit_success(transactionInfo: any) {
  // if the transaction is already completed or failed, capture in sentry and return
  if (transactionInfo.status !== 'pending') {
    Sentry.addBreadcrumb({
      category: 'transaction',
      data: {
        transactionRef: transactionInfo.ref,
      },
      message: `Transaction already ${transactionInfo.status}`,
    });

    Sentry.captureMessage(
      `A transaction webhook for a deposit came in for a transaction that has already ${transactionInfo.status}`,
      'warning'
    );

    return;
  }

  const session = await mongoose.startSession({
    defaultTransactionOptions: {
      readConcern: {level: 'majority'},
      writeConcern: {w: 'majority'},
    },
  });

  await session.withTransaction(async session => {
    try {
      // update the transaction status to success
      await TRANSACTION.updateOne(
        {ref: transactionInfo.ref},
        {status: 'completed'},
        {session}
      );

      // update the user's wallet balance
      const userInfo = await USER.findOneAndUpdate(
        {_id: transactionInfo.userId},
        {$inc: {walletBalance: transactionInfo.amount}},
        {session}
      );

      // add a notification
      await NOTIFICATION.create(
        [
          {
            userId: transactionInfo.userId,
            image: process.env.SKYBOARD_LOGO,
            title: 'Deposit Successful',
            body: `Your deposit of ${(transactionInfo.amount / 100).toFixed(
              2
            )} naira was successful`,
          },
        ],
        {session}
      );

      // send a mail notification to the user
      if (userInfo?.email) {
        await send_mail(userInfo.email, 'deposit', 'Deposit Successful', {
          amount: (transactionInfo.amount / 100).toFixed(2),
          username: userInfo.username,
        });
      }

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();

      throw error;
    } finally {
      await session.endSession();
    }
  });
}

export async function initialize_withdraw(req: Request, res: Response) {
  try {
    const {userId} = req;
    let {amount} = req.body;
    const {bankCode, accountNumber, accountName, description, password} =
      req.body;

    amount = +amount;
    if (isNaN(amount)) {
      res.status(400).json({message: 'Please specify a valid amount'});
      return;
    }

    if (amount < 500) {
      res.status(400).json({message: 'Minimum withdrawal amount is 500 naira'});
      return;
    }

    if (typeof password === 'undefined' || password.length === 0) {
      res.status(401).json({message: 'Please specify a password'});
      return;
    }

    if (typeof accountName === 'undefined' || accountName.length === 0) {
      res.status(400).json({message: 'Please specify a valid account name'});
      return;
    }

    if (typeof accountNumber === 'undefined' || accountNumber.length !== 10) {
      res.status(400).json({message: 'Please specify a valid account number'});
      return;
    }

    if (typeof bankCode === 'undefined' || bankCode.length === 0) {
      res.status(400).json({message: 'Invalid bank code'});
      return;
    }

    const userInfo = await USER.findOne({_id: userId});

    if (!userInfo) {
      res.status(404).json({
        message:
          'There were some issues with your account, please sign in again',
      });
      return;
    }

    // check that password is correct
    const isPasswordCorrect = bcrypt.compareSync(password, userInfo.password);

    if (!isPasswordCorrect) {
      res.status(400).json({message: 'Incorrect password'});
      return;
    }

    // recalculate the charge
    const charge = calculate_charge(amount);

    // check that the user has enough balance
    const total = amount + charge;
    if (userInfo.walletBalance < total) {
      res.status(400).json({message: 'Insufficient funds'});
      return;
    }

    const session = await TRANSACTION.startSession({
      defaultTransactionOptions: {
        readConcern: {level: 'majority'},
        writeConcern: {w: 'majority'},
      },
    });

    await session.withTransaction(async session => {
      try {
        // subtract the amount from the user's wallet
        const resp = await USER.updateOne(
          {_id: userId},
          {$inc: {walletBalance: -total}},
          {session}
        );

        if (resp.modifiedCount === 0) {
          Sentry.addBreadcrumb({
            category: 'transaction',
            data: {
              userId,
              amount,
              charge,
            },
            message: 'Failed to update wallet balance',
          });

          throw new Error('Failed to update wallet balance');
        }

        // create a transaction record with pending status
        const ref = uuidv4();

        // generate transfer receipt from paystack
        const recipientType = 'nuban';
        const currency = 'NGN';

        const paystackResp = await fetch(
          `${process.env.PAYSTACK_BASE_API}/transferrecipient`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: recipientType,
              name: accountName,
              account_number: accountNumber,
              bank_code: bankCode,
              currency,
            }),
          }
        );

        const data = (await paystackResp.json()) as ITransferRecipient;

        if (data.status === false) {
          res.status(400).json({message: data.message});
          return;
        }

        // TODO: store the charge as profit

        await TRANSACTION.create(
          [
            {
              ref,
              userId,
              amount,
              fee: charge,
              total,
              type: 'withdrawal',
              description,
            },
          ],
          {session}
        );

        const recipient_code = data.data.recipient_code;

        // create a tranfer reference
        const referenceResp = await fetch(
          `${process.env.PAYSTACK_BASE_API}/transfer`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              source: 'balance',
              amount: amount,
              reference: ref,
              recipient: recipient_code,
              reason: description || 'Skyboard Withdrawal',
            }),
          }
        );

        const referenceData = (await referenceResp.json()) as ITransferQueued;

        if (referenceData.status === false) {
          res.status(400).json({message: referenceData.message});
          return;
        }

        // not adding a TTL because withdrawals can take very long to process, failure will be handled by the webhook

        // send notification to the user
        await NOTIFICATION.create(
          [
            {
              userId,
              image: process.env.SKYBOARD_LOGO,
              title: 'Withdrawal Initiated',
              body: `Your withdrawal of ${(amount / 100).toFixed(
                2
              )} naira has been initiated`,
            },
          ],
          {session}
        );

        await send_mail(
          userInfo.email,
          'withdrawal-initiated',
          'Withdrawal Initiated',
          {
            amount: (amount / 100).toFixed(2),
            username: userInfo.username,
            ref,
          }
        );

        await session.commitTransaction();

        res.status(200).json({message: 'Withdrawal initialized', data: {ref}});
      } catch (error) {
        await session.abortTransaction();

        throw error;
      } finally {
        await session.endSession();
      }
    });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function handle_withdraw_success(data: ITransferSuccess) {
  // check that the ref matches a transaction then mark as completed
  const {reference} = data;

  const transactionInfo = await TRANSACTION.findOne({ref: reference});

  if (transactionInfo === null) {
    Sentry.addBreadcrumb({
      category: 'webhook',
      data: {
        transactionRef: reference,
      },
      level: 'warning',
      message:
        "There was an attempt to mark a withdrawal as completed, that doesn't exist in the DB",
    });

    Sentry.captureMessage(
      "A transaction webhook for withdrawal came in with a reference that didn't match documents in the DB",
      'warning'
    );

    return;
  }

  if (transactionInfo.status !== 'pending') {
    Sentry.addBreadcrumb({
      category: 'transaction',
      data: {
        transactionRef: reference,
      },
      message: `Transaction already ${transactionInfo.status}`,
    });

    Sentry.captureMessage(
      `A transaction webhook for a withdrawal came in for a transaction that has already been ${transactionInfo.status}`,
      'warning'
    );

    return;
  }

  await TRANSACTION.updateOne({ref: reference}, {status: 'completed'});

  // send a notification to the user
  await NOTIFICATION.create({
    userId: transactionInfo.userId,
    image: process.env.SKYBOARD_LOGO,
    title: 'Withdrawal Completed',
    body: `Your withdrawal of ${(transactionInfo.amount / 100).toFixed(
      2
    )} naira has been completed`,
  });

  // send a mail notification to the user
  const userInfo = await USER.findOne({_id: transactionInfo.userId});

  if (userInfo?.email) {
    await send_mail(
      userInfo.email,
      'withdrawal-completed',
      'Withdrawal Completed',
      {
        amount: (transactionInfo.amount / 100).toFixed(2),
        username: userInfo.username,
        ref: transactionInfo.ref,
      }
    );
  }
}

export async function handle_withdraw_failure(data: ITransferFailed) {
  // check that the ref matches a transaction then mark as failed, and refund the user the amount
  const {reference} = data;

  const transactionInfo = await TRANSACTION.findOne({ref: reference});

  if (transactionInfo === null) {
    Sentry.addBreadcrumb({
      category: 'webhook',
      data: {
        transactionRef: reference,
      },
      level: 'warning',
      message:
        "There was an attempt to mark a withdrawal as failed, that doesn't exist in the DB",
    });

    Sentry.captureMessage(
      "A transaction webhook for withdrawal came in with a reference that didn't match documents in the DB",
      'warning'
    );

    return;
  }

  if (transactionInfo.status !== 'pending') {
    Sentry.addBreadcrumb({
      category: 'transaction',
      data: {
        transactionRef: reference,
      },
      message: `Transaction already ${transactionInfo.status}`,
    });

    Sentry.captureMessage(
      `A transaction webhook for a withdrawal came in for a transaction that has already been ${transactionInfo.status}`,
      'warning'
    );

    return;
  }

  const session = await mongoose.startSession({
    defaultTransactionOptions: {
      readConcern: {level: 'majority'},
      writeConcern: {w: 'majority'},
    },
  });

  await session.withTransaction(async session => {
    try {
      // update the transaction status to failed
      await TRANSACTION.updateOne(
        {ref: reference},
        {status: 'failed'},
        {session}
      );

      // refund the user the amount
      await USER.updateOne(
        {_id: transactionInfo.userId},
        {$inc: {walletBalance: transactionInfo.total}},
        {session}
      );

      // send a notification to the user
      await NOTIFICATION.create(
        [
          {
            userId: transactionInfo.userId,
            image: process.env.SKYBOARD_LOGO,
            title: 'Withdrawal Failed',
            body: `Your withdrawal of ${(transactionInfo.amount / 100).toFixed(
              2
            )} naira has failed, you have been refunded`,
          },
        ],
        {session}
      );

      // send a mail notification to the user
      const userInfo = await USER.findOne({_id: transactionInfo.userId});

      if (userInfo?.email) {
        await send_mail(
          userInfo.email,
          'withdrawal-failed',
          'Withdrawal Failed',
          {
            amount: (transactionInfo.amount / 100).toFixed(2),
            username: userInfo.username,
            ref: transactionInfo.ref,
          }
        );
      }

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();

      throw error;
    } finally {
      await session.endSession();
    }
  });
}
