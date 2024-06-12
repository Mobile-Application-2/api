import {Router} from 'express';
import {is_logged_in} from '../middlewares/auth.middleware';
import {
  create_a_ticket,
  get_notifications,
  refer_a_friend,
  search_users,
  delete_notification,
  delete_all_notifications,
  get_transactions,
  join_waitlist,
  get_games,
  get_game,
  rate_a_game,
  create_a_lobby,
  join_lobby,
} from '../controllers/main.controller';
const router = Router();

// TODO: update to show fave game and no of wins
router.get('/search', is_logged_in, search_users);

router.get('/notifications', is_logged_in, get_notifications);

router.get('/transactions', is_logged_in, get_transactions);

router.get('/games', is_logged_in, get_games);

router.get('/game/:gameId', is_logged_in, get_game);

router.post('/waitlist', join_waitlist);

router.post('/contact', is_logged_in, create_a_ticket);

router.post('/refer', is_logged_in, refer_a_friend);

router.post('/rating', is_logged_in, rate_a_game);

router.post('/create-lobby', is_logged_in, create_a_lobby);

router.post('/join-lobby', is_logged_in, join_lobby);

// router.patch('/announce-game-event', is_logged_in, announce_game_event); // for winners, you can store in new collection

router.delete('/notification/:id', is_logged_in, delete_notification);

router.delete('/notifications', is_logged_in, delete_all_notifications);

export default router;
