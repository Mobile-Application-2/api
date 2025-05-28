import {Router} from 'express';
import {
  get_banks,
  get_transfer_charge,
  get_user_bank_details,
  handle_callback,
  initialize_deposit,
  handle_webhook,
  initialize_withdraw,
  fake_initialize_deposit,
  fake_initialize_withdraw,
  handle_fake_deposit_success,
  handle_fake_withdraw_success,
} from '../controllers/payment.controller';
import {is_admin, is_logged_in} from '../middlewares/auth.middleware';
const router = Router();

router.get('/callback', handle_callback);

router.get('/banks', is_logged_in, get_banks);

router.get(
  '/details/bank/:bank/acc/:accountNumber',
  is_logged_in,
  get_user_bank_details
);

router.get('/charge/:amount', is_logged_in, get_transfer_charge);

router.post('/webhook', handle_webhook);

router.post('/withdraw', is_logged_in, initialize_withdraw);

router.post('/deposit', is_logged_in, initialize_deposit);

router.post('/fake-deposit', is_logged_in, fake_initialize_deposit);

router.post('/fake-deposit-success', is_admin, handle_fake_deposit_success);

router.post('/fake-withdraw', is_logged_in, fake_initialize_withdraw);

router.post('/fake-withdraw-success', is_admin, handle_fake_withdraw_success);

export default router;
