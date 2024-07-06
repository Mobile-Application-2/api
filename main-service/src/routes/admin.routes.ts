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
} from '../controllers/admin.controller';
import {process_file} from '../middlewares/file-upload.middleware';
const router = Router();

// TODO: change the admin password, currently exposed on postman

router.get('/dashboard', get_dashboard_details);

router.get('/users-summary', get_users_summary);

router.get('/users', get_users);

// router.get('/logs');

// TODO: all the game lobby joining and creation logic needs change as well
router.get('/games', get_games);

router.get('/transactions', get_all_transactions);

// router.get('/export/transactions'); // handle csv or pdf

// router.get('/stake-report');

router.post('/games', process_file('image'), create_game);

router.patch('/block/user/:userId', block_user);

router.patch('/unblock/user/:userId', unblock_user);

router.patch('/game/:gameId', process_file('image'), update_game);

export default router;
