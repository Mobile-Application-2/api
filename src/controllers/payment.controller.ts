import {Request, Response} from 'express';
import {
  calculate_charge,
  fetch_account_details,
  fetch_banks,
} from '../utils/paystack';
import {handle_error} from '../utils/handle-error';

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

    if (isNaN(+amount)) {
      res.status(400).json({message: 'Please specify a valid amount'});
      return;
    }

    const charge = calculate_charge(+amount);

    res.status(200).json({message: 'Charge retrieved (in Kobo)', data: charge});
  } catch (error) {
    handle_error(error, res);
  }
}
