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
  get_a_tournament_info,
  see_all_tournaments,
  join_tournament,
  fetch_my_fixtures_in_tournament,
  join_tournament_lobby,
  see_all_tournaments_i_am_in,
  start_tournament_game,
  cancel_tournament_game,
  get_top_active_games,
  get_gamers,
  select_a_user_to_play_with,
  fetch_my_fixtures_in_tournament_lobby_code,
} from '../controllers/main.controller';
import {handle_error} from '../utils/handle-error';
import USER from '../models/user.model';
import ACTIVEUSER from '../models/active.model';
import { get_leaderboard } from '../controllers/celebrity.controller';
import LOBBY from '../models/lobby.model';
const router = Router();

// CHANGE LATER (FROM JOSHUA)
router.get('/user/:userId', is_logged_in, async (req, res) => {
  try {
    const {userId} = req.params as {userId: string};

    if (!userId) {
      res.status(400).json({message: 'user id is required'});
      return;
    }

    const userInfo = await USER.findOne(
      {_id: userId},
      {password: 0, updatedAt: 0}
    );

    if (userInfo === null) {
      res.status(400).json({
        message:
          'Something went wrong while fetching your profile, please log back into your account to continue',
      });

      return;
    }

    res
      .status(200)
      .json({message: 'Profile information retrieved', data: userInfo});
  } catch (error) {
    handle_error(error, res);
  }
});

router.post('/user/verify', is_logged_in, async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      res.status(400).json({message: 'user id is required'});
      return;
    }

    const {firstName, lastName} = req.body as {
      firstName: string;
      lastName: string;
    };

    if (!firstName || !lastName) {
      res.status(400).json({message: 'fullName is required'});
      return;
    }

    const userInfo = await USER.findOne(
      {_id: userId, firstName: firstName, lastName: lastName},
      {password: 0, updatedAt: 0}
    );

    if (userInfo === null) {
      res.status(404).json({
        message:
          'Something went wrong while fetching your profile, please log back into your account to continue',
      });

      return;
    }

    res.status(200).json({message: 'verified successfully'});
  } catch (error) {
    handle_error(error, res);
  }
});

router.get('/active-users', is_logged_in, async (_req, res) => {
  try {
    // const userId = req.userId;

    const pipeline = [
      {
        $addFields: {
          userObjectId: {
            $convert: {
              input: '$userID',
              to: 'objectId',
              onError: null,
              onNull: null,
            },
          },
        },
      },
      {
        $lookup: {
          from: 'users', // collection name in MongoDB (usually the model name in lowercase and pluralized)
          localField: 'userObjectId',
          foreignField: '_id',
          as: 'userInfo',
        },
      },
      {
        $unwind: '$userInfo',
      },
      {
        $project: {
          _id: 0,
          socketID: 1,
          userID: 1,
          username: '$userInfo.username',
          avatar: '$userInfo.avatar',
        },
      },
    ]

    const activeUsers = await ACTIVEUSER.aggregate(pipeline);

    res.status(200).json({message: "successful", data: activeUsers})
  }
  catch(error) {
    handle_error(error, res);
  }
})

router.get(
  '/tournament/:tournamentId/leaderboard',
  is_logged_in,
  get_leaderboard
);

router.get('/search', is_logged_in, search_users);

router.get('/notifications', is_logged_in, get_notifications);

router.get('/transactions', is_logged_in, get_transactions);

router.get('/games', is_logged_in, get_games);

router.get('/game/:gameId', is_logged_in, get_game);

router.get('/referrals', is_logged_in, see_who_i_referred);

router.get('/mylobbies', is_logged_in, get_active_lobbies_i_am_in);

router.get('/tournaments', is_logged_in, see_all_tournaments);

router.get('/tournament/:tournamentId', is_logged_in, get_a_tournament_info);

router.get(
  '/participating-tournaments',
  is_logged_in,
  see_all_tournaments_i_am_in
);

router.get(
  '/tournament/:tournamentId/fixtures',
  is_logged_in,
  fetch_my_fixtures_in_tournament
);

router.get(
  '/tournament/:tournamentId/fixtures/:lobbyCode',
  is_logged_in,
  fetch_my_fixtures_in_tournament_lobby_code
);

router.get('/top/games', is_logged_in, top_games); // games with most number of current active lobbies (plays) in the last week

router.get('/top/gamers', is_logged_in, top_gamers); // players with most win weekly

router.get('/top-active-games', is_logged_in, get_top_active_games);

router.get('/gamers', is_logged_in, get_gamers);


// JOSHUA
// AT THE REQUEST FROM THE MOBILE DEV
router.get('/lobby/participants/:lobbyCode', is_logged_in, async (req, res) => {
  const { lobbyCode } = req.params;

  if(!lobbyCode) {
    res.status(400).json({message: "specify a lobby code"});

    return;
  }

  try {
    const lobby = await LOBBY.findOne({code: lobbyCode});

    if(!lobby) {
      res.status(400).json({message: "no lobby found"});

      return;
    }

    const fd = await Promise.all(lobby.participants.filter(uId => uId.toString() != lobby.creatorId.toString()).map(uId => USER.findById(uId)));

    const finalData = fd.map(user => {
      return {
        username: user?.username,
        avatar: user?.avatar || "https://game-service-uny2.onrender.com/game/Scrabble/a1.png",
        userId: user?._id 
      }
    })

    res.status(200).json({message: "successful", data: finalData})
  }
  catch(error) {
    handle_error(error, res);
  }
});

router.post('/gamers/select', is_logged_in, select_a_user_to_play_with);

router.post('/waitlist', join_waitlist);

router.post('/contact', is_logged_in, create_a_ticket);

router.post('/refer', is_logged_in, refer_a_friend);

router.post('/rating', is_logged_in, rate_a_game);

router.post('/create-lobby', is_logged_in, create_a_lobby);

router.post('/join-lobby', is_logged_in, join_lobby);

router.post('/join-tournament', is_logged_in, join_tournament);

router.post(
  '/tournament/:tournamentId/lobby/:lobbyCode',
  is_logged_in,
  join_tournament_lobby
);

// this going to come from the game server
router.patch(
  '/tournament/start-fixture-game',
  is_game_server,
  start_tournament_game
);

// this going to come from the game server
router.patch(
  '/tournament/cancel-fixture-game',
  is_game_server,
  cancel_tournament_game
);

// this going to come from the game server
router.patch('/game/start', is_game_server, start_game);

// this going to come from the game server
router.patch('/game/cancel', is_game_server, cancel_game);

router.patch('/game/replay', is_logged_in, replay_game);

router.delete('/notification/:id', is_logged_in, delete_notification);

router.delete('/notifications', is_logged_in, delete_all_notifications);

export default router;
