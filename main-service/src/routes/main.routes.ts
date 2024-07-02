import {Router} from 'express';
import {is_game_server, is_logged_in} from '../middlewares/auth.middleware';
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
  see_who_i_referred,
  get_active_lobbies_i_am_in,
  start_game,
  replay_game,
  cancel_game,
  top_games,
  top_gamers,
} from '../controllers/main.controller';
const router = Router();

router.get('/search', is_logged_in, search_users);

router.get('/notifications', is_logged_in, get_notifications);

router.get('/transactions', is_logged_in, get_transactions);

router.get('/games', is_logged_in, get_games); // TODO: update to show no of players

router.get('/game/:gameId', is_logged_in, get_game);

router.get('/referrals', is_logged_in, see_who_i_referred);

router.get('/mylobbies', is_logged_in, get_active_lobbies_i_am_in);

// TODO: router.get('/top/competitions') // tournaments with most participants this week

router.get('/top/games', is_logged_in, top_games); // games with most number of current active lobbies (plays) in the last week

router.get('/top/gamers', is_logged_in, top_gamers); // players with most win weekly

router.post('/waitlist', join_waitlist);

router.post('/contact', is_logged_in, create_a_ticket);

router.post('/refer', is_logged_in, refer_a_friend);

router.post('/rating', is_logged_in, rate_a_game);

router.post('/create-lobby', is_logged_in, create_a_lobby);

router.post('/join-lobby', is_logged_in, join_lobby);

// TODO: router.post('/join-tournament') // join a tournament (pay entry fee)

// TODO: router.patch('/tournament/lobby/:lobbyCode') // join a tournament's fixture/lobby no payment

// this going to come from the game server
router.patch('/game/start', is_game_server, start_game);

// this going to come from the game server
router.patch('/game/cancel', is_game_server, cancel_game);

router.patch('/game/replay', is_logged_in, replay_game);

router.delete('/notification/:id', is_logged_in, delete_notification);

router.delete('/notifications', is_logged_in, delete_all_notifications);

export default router;
