import {Router, Request, Response} from 'express';
import {
  create_game,
  update_game,
  get_games,
  get_dashboard_details,
  get_users_summary,
  get_users,
  block_user,
  unblock_user,
  get_all_transactions,
  get_stake_report,
  reset_admin_password,
  send_reset_admin_password_email,
  change_admin_password,
  admin_login,
} from '../controllers/admin.controller';
import {process_file} from '../middlewares/file-upload.middleware';
import {is_admin} from '../middlewares/auth.middleware';
import TRANSACTION from '../models/transaction.model';
import { handle_error } from '../utils/handle-error';

import { PopulateOptions } from 'mongoose';

const router = Router();

router.get('/dashboard', is_admin, get_dashboard_details);

router.get('/users-summary', is_admin, get_users_summary);

router.get('/users', is_admin, get_users);

router.get('/games', is_admin, get_games);

router.get('/transactions', is_admin, get_all_transactions);

router.get('/stake-report', is_admin, get_stake_report);

router.get('/transactions-manual', is_admin, async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '100', type } = req.query;

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);

    if (isNaN(pageNumber) || pageNumber < 1) {
      res.status(400).json({ message: 'Invalid page number' });
      return;
    }

    if (isNaN(limitNumber) || limitNumber < 1) {
      res.status(400).json({ message: 'Invalid limit number' });
      return;
    }

    const query: Record<string, any> = {};

    if (type) {
      if (type !== 'deposit' && type !== 'withdrawal') {
        res.status(400).json({ message: 'Invalid transaction type' });
        return;
      }
      query.type = type;
    }

    query.manual = true;

    const populateOptions: PopulateOptions = {
      path: "userId",
      select: "username email phoneNumber isCelebrity firstName lastName account_number account_name bank_name",
    }

    const transactions = await TRANSACTION.find(query)
      .populate(populateOptions)
      .sort({ createdAt: -1 }) // Most recent first
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber);

    const total = await TRANSACTION.countDocuments(query);

    res.status(200).json({
      data: transactions,
      meta: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    handle_error(error, res);
  }
})

router.get('/transactions-manual/pending-count', is_admin, async (_req: Request, res: Response) => {
  try {
    const dQuery: Record<string, any> = {
      manual: true,
      status: "pending",
      type: "deposit"
    };

    const wQuery: Record<string, any> = {
      manual: true,
      status: "pending",
      type: "withdrawal"
    };

    const dTransactions = await TRANSACTION.countDocuments(dQuery);
    const wTransactions = await TRANSACTION.countDocuments(wQuery);

    const total = await TRANSACTION.countDocuments({manual: true});

    res.status(200).json({
      data: {
        deposits: dTransactions,
        withdrawals: wTransactions,
        total: total
      },
    });
  } catch (error) {
    handle_error(error, res);
  }
})

router.post('/games', is_admin, process_file('image'), create_game);

router.post('/login', admin_login);

router.patch('/password', is_admin, change_admin_password);

router.patch('/block/user/:userId', is_admin, block_user);

router.patch('/unblock/user/:userId', is_admin, unblock_user);

router.patch('/game/:gameId', is_admin, process_file('image'), update_game);

router.patch(
  '/send-reset-password-mail',
  is_admin,
  send_reset_admin_password_email
);

router.patch('/reset-password', is_admin, reset_admin_password);

export default router;
