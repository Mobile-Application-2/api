import {Router} from 'express';
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
const router = Router();

router.get('/dashboard', is_admin, get_dashboard_details);

router.get('/users-summary', is_admin, get_users_summary);

router.get('/users', is_admin, get_users);

router.get('/games', is_admin, get_games);

router.get('/transactions', is_admin, get_all_transactions);

router.get('/stake-report', is_admin, get_stake_report);

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
