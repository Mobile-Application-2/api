import {Router} from 'express';
import {
  get_my_tournaments,
  get_a_tournament,
  get_tournament_winners,
  get_tournament_participants,
  create_tournament,
  update_prizes_to_tournament,
  update_tournament_code,
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
  '/tournament/:tournamenId/winners',
  is_logged_in,
  is_celebrity,
  get_tournament_winners
);

// router.get('/tournaments/winners'); // TODO: players with most win all time for my tournaments

router.get(
  '/tournament/:tournamentId/participants',
  is_logged_in,
  is_celebrity,
  get_tournament_participants
);

// router.get('/tournaments/:tournamentId/fixtures'); // TODO: get all fixtures for a tournament

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

// router.patch('/tournaments/:tournamentId/start') // officially start the tournament and get first fixtures

export default router;
