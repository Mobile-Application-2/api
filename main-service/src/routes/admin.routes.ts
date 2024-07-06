import {Router} from 'express';
import {
  create_game,
  update_game,
  get_games,
  get_dashboard_details,
} from '../controllers/admin.controller';
import {process_file} from '../middlewares/file-upload.middleware';
const router = Router();

// TODO: change the admin password, currently exposed on postman
router.get('/dashboard', get_dashboard_details);

// router.get('/users-summary');

// router.get('/users');

// router.get('/logs');

// TODO: update the games on user side to only show games that have been activated, and all the game lobby joining and creation details as well
router.get('/games', get_games);

// router.get('/transactions');

// router.get('/export/transactions');

// router.get('/stake-report');

router.post('/games', process_file('image'), create_game);

// router.patch('/block/user/:userId');

// router.patch('/unblock/user/:userId');

router.patch('/game/:gameId', process_file('image'), update_game);

export default router;
