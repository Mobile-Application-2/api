import {Router} from 'express';
import {
  get_my_tournaments,
  get_a_tournament,
  get_tournament_winners,
  get_tournament_participants,
  create_tournament,
  update_prizes_to_tournament,
  update_tournament_code,
  get_players_with_most_wins_in_my_tournaments,
  start_a_tournament,
  fetch_tournament_fixtures,
  get_leaderboard,
} from '../controllers/celebrity.controller';
import {is_celebrity, is_logged_in} from '../middlewares/auth.middleware';
const router = Router();

router.get('/tournaments', is_logged_in, is_celebrity, get_my_tournaments);

router.get(
  '/tournament/:tournamentId',
  is_logged_in,
  is_celebrity,
  get_a_tournament
);

router.get(
  '/tournament/:tournamentId/winners',
  is_logged_in,
  is_celebrity,
  get_tournament_winners
);

router.get(
  '/tournaments/top-winners',
  is_logged_in,
  is_celebrity,
  get_players_with_most_wins_in_my_tournaments
);

router.get(
  '/tournament/:tournamentId/participants',
  is_logged_in,
  is_celebrity,
  get_tournament_participants
);

router.get(
  '/tournament/:tournamentId/fixtures',
  is_logged_in,
  is_celebrity,
  fetch_tournament_fixtures
);

router.get(
  '/tournament/:tournamentId/leaderboard',
  is_logged_in,
  is_celebrity,
  get_leaderboard
);

router.post('/tournaments', is_logged_in, is_celebrity, create_tournament);

router.patch(
  '/tournament/:tournamentId/prizes',
  is_logged_in,
  is_celebrity,
  update_prizes_to_tournament
);

router.patch(
  '/tournament/:tournamentId/code',
  is_logged_in,
  is_celebrity,
  update_tournament_code
);

router.patch(
  '/tournament/:tournamentId/start',
  is_logged_in,
  is_celebrity,
  start_a_tournament
);

export default router;
