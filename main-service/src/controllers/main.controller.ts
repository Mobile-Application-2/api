import TICKET from '../models/ticket.model';
import USER from '../models/user.model';
import { handle_error } from '../utils/handle-error';
import { Request, Response } from 'express';
import send_mail from '../utils/nodemailer';
import NOTIFICATION from '../models/notification.model';
import isEmail from 'validator/lib/isEmail';
import mongoose, { PipelineStage, isValidObjectId } from 'mongoose';
import TRANSACTION from '../models/transaction.model';
import WAITLIST from '../models/waitlist.model';
import GAME from '../models/game.model';
import GAMERATING from '../models/game-rating.model';
import { generate_lobby_code } from '../utils/generate-lobby-code';
import LOBBY from '../models/lobby.model';
import ESCROW from '../models/escrow.model';
import REFERRAL from '../models/referral.model';
import * as Sentry from '@sentry/node';
const ObjectId = mongoose.Types.ObjectId;
import { v4 as uuidV4 } from 'uuid';
import TOURNAMENT from '../models/tournament.model';
import TOURNAMENTESCROW from '../models/tournament-escrow.model';
import TOURNAMENTFIXTURES from '../models/tournament-fixtures.model';
import ADMIN from '../models/admin.model';
import ADMINTRANSACTION from '../models/admin-transaction.model';
import { notifyUserBalanceUpdate } from '../services/balance.service';
import { scheduleIdleLobbyCheck } from '../agenda/jobs';

export async function search_users(req: Request, res: Response) {
  try {
    const { q: searchQuery } = req.query;

    if (typeof searchQuery !== 'string' || searchQuery.trim() === '') {
      res.status(400).json({ mesage: 'Please specify a search query' });
      return;
    }

    // shows fave game and no of wins
    const pipeline: PipelineStage[] = [
      {
        $match: {
          username: {
            $regex: searchQuery,
            $options: 'i',
          },
        },
      },
      {
        $limit: 50,
      },
      {
        $lookup: {
          from: 'lobbies',
          let: {
            userId: '$_id',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ['$$userId', '$participants'],
                },
              },
            },
          ],
          as: 'userLobbies',
        },
      },
      {
        $unwind: '$userLobbies',
      },
      {
        $group: {
          _id: {
            userId: '$_id',
            gameId: '$userLobbies.gameId',
          },
          count: {
            $sum: 1,
          },
        },
      },
      {
        $sort: {
          count: -1,
        },
      },
      {
        $group: {
          _id: '$_id.userId',
          favoriteGame: {
            $first: '$_id.gameId',
          },
          favoriteGameCount: {
            $first: '$count',
          },
        },
      },
      {
        $lookup: {
          from: 'lobbies',
          let: {
            userId: '$_id',
            gameId: '$favoriteGame',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: ['$gameId', '$$gameId'],
                    },
                    {
                      $in: ['$$userId', '$winners'],
                    },
                  ],
                },
              },
            },
          ],
          as: 'favoriteGameLobbies',
        },
      },
      {
        $unwind: {
          path: '$favoriteGameLobbies',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          winCount: {
            $size: {
              $filter: {
                input: {
                  $ifNull: ['$favoriteGameLobbies.winners', []],
                },
                as: 'winner',
                cond: {
                  $eq: ['$$winner', '$_id'],
                },
              },
            },
          },
        },
      },
      {
        $group: {
          _id: '$_id',
          favoriteGame: {
            $first: '$favoriteGame',
          },
          favoriteGameCount: {
            $first: '$favoriteGameCount',
          },
          totalWins: {
            $sum: '$winCount',
          },
        },
      },
      {
        $lookup: {
          from: 'games',
          localField: 'favoriteGame',
          foreignField: '_id',
          as: 'favoriteGameInfo',
        },
      },
      {
        $addFields: {
          favoriteGameInfo: {
            $arrayElemAt: ['$favoriteGameInfo', 0],
          },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo',
        },
      },
      {
        $addFields: {
          userInfo: {
            $arrayElemAt: ['$userInfo', 0],
          },
        },
      },
      {
        $addFields: {
          username: '$userInfo.username',
          bio: '$userInfo.bio',
          avatar: '$userInfo.avatar',
        },
      },
      {
        $project: {
          username: 1,
          avatar: 1,
          bio: 1,
          favoriteGame: '$favoriteGameInfo',
          favoriteGameCount: 1,
          totalWins: 1,
        },
      },
    ];

    // fetch results based on only usernames
    const users = await USER.aggregate(pipeline);

    res.status(200).json({ message: 'Success', data: users });
  } catch (error) {
    handle_error(Error, res);
  }
}

export async function create_a_ticket(req: Request, res: Response) {
  try {
    const { fullName, email, message } = req.body;
    const { userId } = req;

    const ticketInfo = await TICKET.create({
      fullName,
      email,
      message,
      userId,
    });

    // send the ticket via mail to the admin and another one to the user letting them know the ticket is received
    await send_mail(email, 'ticket', 'Ticket Received', {
      ticketId: ticketInfo._id,
      fullName,
    });

    await send_mail(
      process.env.EMAIL as string,
      'ticket-admin',
      'New Ticket Created',
      {
        ticketId: ticketInfo._id,
        fullName,
        email,
        message,
      }
    );

    res.status(201).json({ message: 'Ticket filed successfully' });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function refer_a_friend(req: Request, res: Response) {
  try {
    const { email } = req.body;
    const { userId } = req;

    if (!email || isEmail(email) === false) {
      res.status(400).json({ message: 'Please provide a valid email address' });
      return;
    }

    const userInfo = await USER.findOne({ _id: userId });

    if (!userInfo) {
      res.status(404).json({
        message:
          "There is a problem with your account's status. Please contact support or try again later",
      });
      return;
    }

    const emailIsAlreadyInUse = await USER.findOne({
      email,
    });

    if (emailIsAlreadyInUse) {
      res.status(400).json({ message: 'This email is already signed up' });
      return;
    }

    // send the referral email to the friend
    await send_mail(
      email,
      'referral',
      `${email} is inviting you to join skyboard`,
      {
        referrer: userInfo.username,
        refereeEmail: email,
        referalLink: `${process.env.FRONTEND_URL}/signup?ref=${userInfo._id}`,
        referalCode: userInfo._id,
      }
    );

    res.status(200).json({ message: 'Referral sent successfully' });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function get_notifications(req: Request, res: Response) {
  try {
    const { userId } = req;
    const { pageNo } = req.query;

    const MAX_RESULTS = 250;
    let currentPage;

    if (typeof pageNo !== 'string' || isNaN(+pageNo) || +pageNo <= 0) {
      currentPage = 1;
    } else {
      currentPage = Math.floor(+pageNo);
    }

    const skip = (currentPage - 1) * MAX_RESULTS;

    const notifications = await NOTIFICATION.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(MAX_RESULTS);

    const notificationIds = notifications.map(notification => notification._id);

    // mark all notifications as read
    await NOTIFICATION.updateMany({ _id: { $in: notificationIds } }, { read: true });

    res.status(200).json({ message: 'Success', data: notifications });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function delete_notification(req: Request, res: Response) {
  try {
    const { userId } = req;
    const { id: notificationId } = req.params;

    if (!isValidObjectId(notificationId)) {
      res.status(400).json({ message: 'Invalid notification id' });
      return;
    }

    const notification = await NOTIFICATION.findOne({ _id: notificationId });

    if (!notification) {
      res.status(404).json({ message: 'Notification not found' });
      return;
    }

    if (!notification.userId.equals(userId)) {
      res
        .status(403)
        .json({ message: 'You are not authorized to delete this notification' });
      return;
    }

    await notification.deleteOne({ _id: notificationId });

    res.status(200).json({ message: 'Notification deleted successfully' });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function delete_all_notifications(req: Request, res: Response) {
  try {
    const { userId } = req;

    await NOTIFICATION.deleteMany({ userId });

    res.status(200).json({ message: 'All notifications deleted successfully' });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function get_transactions(req: Request, res: Response) {
  try {
    const { userId } = req;
    const { pageNo } = req.query;

    const MAX_RESULTS = 250;
    let currentPage;

    if (typeof pageNo !== 'string' || isNaN(+pageNo) || +pageNo <= 0) {
      currentPage = 1;
    } else {
      currentPage = Math.floor(+pageNo);
    }

    const skip = (currentPage - 1) * MAX_RESULTS;

    const transactions = await TRANSACTION.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(MAX_RESULTS);

    // not returing the total number of transactions so you can use infinite scroll
    res.status(200).json({ message: 'Success', data: transactions });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function join_waitlist(req: Request, res: Response) {
  try {
    const { email } = req.body;

    if (!email || isEmail(email) === false) {
      res.status(400).json({ message: 'Please provide a valid email address' });
      return;
    }

    // check if the email is already in the waitlist or already signed up
    const userExists = await USER.findOne({ email });

    if (userExists) {
      res.status(400).json({ message: 'You are already signed up' });
      return;
    }

    const alreadyInWaitlist = await WAITLIST.findOne({ email });

    if (alreadyInWaitlist) {
      res.status(400).json({ message: 'You are already in the waitlist' });
      return;
    }

    await WAITLIST.create({ email });

    await send_mail(email, 'waitlist', 'You have been added to the waitlist', {
      email,
    });

    res.status(201).json({ message: 'You have been added to the waitlist' });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function get_games(_: Request, res: Response) {
  try {
    // shows no of players of this game all time
    const pipeline: PipelineStage[] = [
      {
        $match: {
          isActive: true,
        },
      },
      {
        $lookup: {
          from: 'lobbies',
          localField: '_id',
          foreignField: 'gameId',
          as: 'lobbies',
        },
      },
      {
        $addFields: {
          uniquePlayers: {
            $reduce: {
              input: '$lobbies.participants',
              initialValue: [],
              in: {
                $setUnion: ['$$value', '$$this'],
              },
            },
          },
        },
      },
      {
        $addFields: {
          totalNumberOfPlayers: {
            $size: '$uniquePlayers',
          },
        },
      },
      {
        $project: {
          uniquePlayers: 0,
          lobbies: 0,
        },
      },
    ];

    const games = await GAME.aggregate(pipeline);

    res.status(200).json({ message: 'Success', data: games });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function get_game(req: Request, res: Response) {
  try {
    const { gameId } = req.params;

    if (!isValidObjectId(gameId)) {
      res.status(400).json({ message: 'Invalid game id' });
      return;
    }

    const game = await GAME.findOne({ _id: gameId });

    if (!game) {
      res.status(404).json({ message: 'Game not found' });
      return;
    }

    res.status(200).json({ message: 'Success', data: game });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function rate_a_game(req: Request, res: Response) {
  try {
    const { gameId, rating } = req.body;
    const { userId } = req;

    if (!isValidObjectId(gameId)) {
      res.status(400).json({ message: 'Invalid game id' });
      return;
    }

    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      res.status(400).json({ message: 'Invalid rating' });
      return;
    }

    const gameInfo = await GAME.findOne({ _id: gameId });

    if (!gameInfo) {
      res.status(404).json({ message: 'Game not found' });
      return;
    }

    const session = await mongoose.startSession({
      defaultTransactionOptions: {
        writeConcern: { w: 'majority' },
        readConcern: { level: 'majority' },
      },
    });

    await session.withTransaction(async session => {
      try {
        await GAMERATING.updateOne(
          { gameId, userId },
          { rating },
          { upsert: true, session }
        );

        // get new average rating
        const pipeline = [
          {
            $match: { gameId: gameInfo._id },
          },
          {
            $group: {
              _id: null,
              avgRating: { $avg: '$rating' },
            },
          },
        ];

        const [{ avgRating }] = await GAMERATING.aggregate(pipeline);

        await GAME.updateOne(
          { _id: gameInfo._id },
          { averageRating: avgRating },
          { session }
        );

        await session.commitTransaction();
        res.status(201).json({ message: 'Game rated successfully' });
      } catch (error) {
        await session.abortTransaction();

        throw error;
      } finally {
        await session.endSession();
      }
    });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function create_a_lobby(req: Request, res: Response) {
  try {
    const { userId } = req;
    const { gameId, wagerAmount } = req.body;

    if (!isValidObjectId(gameId)) {
      res.status(400).json({ message: 'Invalid game id' });
      return;
    }

    const gameInfo = await GAME.findOne({ _id: gameId });

    if (!gameInfo) {
      res.status(404).json({ message: 'Game not found' });
      return;
    }

    if (!gameInfo.isActive) {
      res.status(400).json({
        message:
          'This game is not active at the moment, please try again later',
      });
      return;
    }

    // find a way to ensure this will not be decimal (fractional) should always be a full integer
    const minWager = 10000; // 1k naira
    if (typeof wagerAmount !== 'number') {
      res.status(400).json({ message: 'Invalid wager amount' });
      return;
    }

    if (wagerAmount < minWager) {
      res
        .status(400)
        .json({ message: 'Wager amount must be at least 1000 naira' });
      return;
    }

    if (!Number.isInteger(wagerAmount)) {
      res.status(400).json({ message: 'Wager amount must be a whole number' });
      return;
    }

    // check user's balance
    const userInfo = await USER.findOne({ _id: userId });

    if (!userInfo) {
      res.status(404).json({
        message: 'There was a problem with your account, try to login again',
      });
      return;
    }

    if (userInfo.walletBalance < wagerAmount) {
      res.status(400).json({ message: 'Insufficient balance' });
      return;
    }

    const session = await mongoose.startSession({
      defaultTransactionOptions: {
        writeConcern: { w: 'majority' },
        readConcern: { level: 'majority' },
      },
    });

    await session.withTransaction(async session => {
      try {
        // deduct the wager amount from the user's wallet
        await USER.updateOne(
          { _id: userId },
          { $inc: { walletBalance: -wagerAmount } },
          { session }
        );

        // create a new transaction entry
        await TRANSACTION.create(
          [
            {
              amount: wagerAmount,
              description: 'Moved money to escrow',
              fee: 0,
              ref: uuidV4(),
              status: 'completed',
              total: wagerAmount,
              type: 'withdrawal',
              userId: userId,
            },
          ],
          { session }
        );

        // create a new lobby
        const lobbyCode = await generate_lobby_code();

        const lobbyInfo = await LOBBY.create(
          [
            {
              code: lobbyCode,
              creatorId: userId,
              gameId: gameInfo._id,
              wagerAmount,
              participants: [userId],
            },
          ],
          { session }
        );

        // create a new escrow
        await ESCROW.create(
          [
            {
              lobbyId: lobbyInfo[0]._id,
              totalAmount: wagerAmount,
              playersThatHavePaid: [userId],
            },
          ],
          { session }
        );

        await session.commitTransaction();

        res.status(201).json({
          message: 'Lobby created successfully',
          data: { code: lobbyCode, _id: lobbyInfo[0]._id },
        });

        notifyUserBalanceUpdate(userId as string, userInfo.walletBalance - wagerAmount);

        scheduleIdleLobbyCheck(lobbyInfo[0]._id.toString());
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        await session.endSession();
      }
    });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function join_lobby(req: Request, res: Response) {
  try {
    const { userId } = req;
    const { lobbyCode } = req.body;

    // check user's balance
    const userInfo = await USER.findOne({ _id: userId });

    if (!userInfo) {
      res.status(404).json({
        message: 'There was a problem with your account, try to login again',
      });
      return;
    }

    // check lobby code
    if (typeof lobbyCode !== 'string' || lobbyCode.trim() === '') {
      res.status(400).json({ message: 'Invalid lobby code' });
      return;
    }

    type updatedGameId = { _id: mongoose.Types.ObjectId; maxPlayers: number };
    const lobbyInfo = await LOBBY.findOne({
      code: lobbyCode,
      active: true,
      dead: false
    }).populate<{ gameId: updatedGameId }>('gameId', 'maxPlayers');

    if (!lobbyInfo) {
      res.status(404).json({ message: 'No active lobby found with that code' });
      return;
    }

    // check if user is already in the lobby
    if (
      lobbyInfo.participants.map(x => x.toString()).includes(userId as string)
    ) {
      res.status(400).json({ message: 'You are already in this lobby' });
      return;
    }

    // check if max players have been reached
    if (lobbyInfo.participants.length >= lobbyInfo.gameId.maxPlayers) {
      res.status(400).json({ message: 'This lobby is full' });
      return;
    }

    if (userInfo.walletBalance < lobbyInfo.wagerAmount) {
      res.status(400).json({
        message: `Insufficient balance, a minimum of ${(
          lobbyInfo.wagerAmount / 100
        ).toFixed(2)} naira is required`,
      });
      return;
    }

    const session = await mongoose.startSession({
      defaultTransactionOptions: {
        writeConcern: { w: 'majority' },
        readConcern: { level: 'majority' },
      },
    });

    await session.withTransaction(async session => {
      try {
        // deduct the wager amount from the user's wallet
        await USER.updateOne(
          { _id: userId },
          { $inc: { walletBalance: -lobbyInfo.wagerAmount } },
          { session }
        );

        // create a new transaction entry
        await TRANSACTION.create(
          [
            {
              amount: lobbyInfo.wagerAmount,
              description: 'Moved money to escrow',
              fee: 0,
              ref: uuidV4(),
              status: 'completed',
              total: lobbyInfo.wagerAmount,
              type: 'withdrawal',
              userId: userId,
            },
          ],
          { session }
        );

        // update the lobby
        await LOBBY.updateOne(
          { code: lobbyCode, active: true },
          { $push: { participants: userId } },
          { session }
        );

        // update escrow
        await ESCROW.findOneAndUpdate(
          { lobbyId: lobbyInfo._id },
          {
            $inc: { totalAmount: lobbyInfo.wagerAmount },
            $push: { playersThatHavePaid: userId },
          },
          { session, sort: { createdAt: -1 } } // updates the newest escrow record
        );

        await session.commitTransaction();

        res.status(200).json({
          message: 'You have joined the lobby',
          data: { code: lobbyCode, _id: lobbyInfo._id },
        });

        notifyUserBalanceUpdate(userId as string, userInfo.walletBalance - lobbyInfo.wagerAmount);
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        await session.endSession();
      }
    });
    res.end();
  } catch (error) {
    handle_error(error, res);
  }
}

export async function see_who_i_referred(req: Request, res: Response) {
  try {
    const { userId } = req;

    const pipeline: PipelineStage[] = [
      {
        $match: { referrer: new ObjectId(userId) },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'referred',
          foreignField: '_id',
          as: 'referredUser',
          pipeline: [
            {
              $project: {
                username: 1,
                phoneNumber: 1,
                avatar: 1,
              },
            },
          ],
        },
      },
      {
        $addFields: {
          referredUser: { $arrayElemAt: ['$referredUser', 0] },
        },
      },
      {
        $replaceRoot: {
          newRoot: '$referredUser',
        },
      },
    ];

    const referrals = await REFERRAL.aggregate(pipeline);

    res.status(200).json({ message: 'Success', data: referrals });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function get_active_lobbies_i_am_in(req: Request, res: Response) {
  try {
    const { userId } = req;

    const lobbies = await LOBBY.find({
      participants: { $in: userId },
      active: true,
    });

    res
      .status(200)
      .json({ message: 'Lobbies retrieved successfully', data: lobbies });
  } catch (error) {
    handle_error(error, res);
  }
}

// request made from the server
export async function start_game(req: Request, res: Response) {
  try {
    const { lobbyId } = req.body;

    if (!isValidObjectId(lobbyId)) {
      res.status(400).json({ message: 'Invalid lobby Id' });
      return;
    }

    // no of escrows needs to match the no of games played projected
    const lobbyInfo = await LOBBY.findOne({ _id: lobbyId, active: true, dead: false });

    if (lobbyInfo === null) {
      res.status(404).json({ message: 'No active lobby found for the given Id' });
      return;
    }

    // count escrows
    const noOfEscrows = await ESCROW.countDocuments({ lobbyId });

    // there needs to be an escrow for the new game
    if (noOfEscrows !== lobbyInfo.noOfGamesPlayed + 1) {
      res.status(400).json({
        message:
          'Invalid request, please try to replay the game properly to create an escrow payment and try again',
      });
      return;
    }

    // update the number of games playes
    await LOBBY.updateOne({ _id: lobbyId }, { $inc: { noOfGamesPlayed: 1 }, inGame: true });

    res.status(200).json({ message: 'Game started successfully' });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function replay_game(req: Request, res: Response) {
  try {
    const { userId } = req;
    const { lobbyId } = req.body;

    const userInfo = await USER.findOne({ _id: userId });

    if (userInfo === null) {
      res.status(401).json({
        message:
          'Something went wrong while verifying your account, please logged back in',
      });
      return;
    }

    // check lobby
    if (!isValidObjectId(lobbyId)) {
      res.status(400).json({ message: 'Invalid lobby Id' });
      return;
    }

    const lobbyInfo = await LOBBY.findOne({ _id: lobbyId, active: true });

    if (lobbyInfo === null) {
      res.status(404).json({ message: 'No active lobby found for the given Id' });
      return;
    }

    // check that user is a participant in the lobby
    if (
      !lobbyInfo.participants
        .map(x => x.toString())
        .includes(userInfo._id.toString())
    ) {
      res.status(400).json({
        message: 'You can not replay a game in a lobby you are not a part of',
      });
      return;
    }

    // check user's balance
    if (userInfo.walletBalance < lobbyInfo.wagerAmount) {
      res
        .status(400)
        .json({ message: 'You do not have enough funds to replay this game' });
      return;
    }

    const escrowCount = await ESCROW.countDocuments({ lobbyId });

    // check that I have not attempted to replay already
    if (escrowCount > lobbyInfo.noOfGamesPlayed) {
      const latestEscrow = await ESCROW.findOne(
        { lobbyId },
        {},
        { sort: { createdAt: -1 } }
      );

      if (latestEscrow === null) {
        Sentry.addBreadcrumb({
          category: 'game',
          data: { lobbyId, userId },
          level: 'error',
        });

        Sentry.captureMessage(
          'While a user was trying to replay a game, the system could not find any escrow payment',
          { level: 'error' }
        );
        res.status(500).json({ message: 'Something went wrong' });
        return;
      }

      // you guys have not started the game yet
      if (escrowCount === 1) {
        res.status(400).json({
          message: 'Please play the first game before attempting to replay',
        });
        return;
      }

      if (
        latestEscrow.playersThatHavePaid
          .map(x => x.toString())
          .includes(userInfo._id.toString())
      ) {
        res.status(400).json({
          message:
            'You have already attempted to replay, please wait for the other user to confirm',
        });
        return;
      }
    }

    const session = await mongoose.startSession({
      defaultTransactionOptions: {
        writeConcern: { w: 'majority' },
        readConcern: { level: 'majority' },
      },
    });

    await session.withTransaction(async session => {
      try {
        // deduct the wager amount from the user's wallet
        await USER.updateOne(
          { _id: userId },
          { $inc: { walletBalance: -lobbyInfo.wagerAmount } },
          { session }
        );

        // create a new transaction entry
        await TRANSACTION.create(
          [
            {
              amount: lobbyInfo.wagerAmount,
              description: 'Moved money to escrow',
              fee: 0,
              ref: uuidV4(),
              status: 'completed',
              total: lobbyInfo.wagerAmount,
              type: 'withdrawal',
              userId: userId,
            },
          ],
          { session }
        );

        // if there are more escrows the other person has clicked replay
        if (escrowCount > lobbyInfo.noOfGamesPlayed) {
          await ESCROW.findOneAndUpdate(
            { lobbyId: lobbyInfo._id },
            {
              $inc: { totalAmount: lobbyInfo.wagerAmount },
              $push: { playersThatHavePaid: userId },
            },
            { session, sort: { createdAt: -1 } } // updates the newest escrow record
          );
        } else if (escrowCount === lobbyInfo.noOfGamesPlayed) {
          await ESCROW.create(
            [
              {
                lobbyId: lobbyInfo._id,
                totalAmount: lobbyInfo.wagerAmount,
                playersThatHavePaid: [userId],
              },
            ],
            { session }
          );
        } else {
          Sentry.addBreadcrumb({
            category: 'game',
            data: { lobbyId, userId },
            level: 'error',
          });

          Sentry.captureMessage(
            "While handling a user replay_game request, the number of escrows was less than the number of games played which shouldn't be possible",
            { level: 'error' }
          );

          throw Error('Something went wrong');
        }

        await session.commitTransaction();

        res.status(200).json({
          message: 'Success, wait for the other user(s) to replay',
        });
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        await session.endSession();
      }
    });
  } catch (error) {
    handle_error(error, res);
  }
}

// request made from the server
export async function cancel_game(req: Request, res: Response) {
  try {
    const { userWhoCancelledId, lobbyId } = req.body;

    if (!isValidObjectId(userWhoCancelledId) || !isValidObjectId(lobbyId)) {
      res.status(400).json({ message: 'Invalid request' });
      return;
    }

    // check if user who cancelled is in lobby, in this case I don't need to check if lobby is active
    // as the escrow payout will block multiple request from passing
    const lobbyInfo = await LOBBY.findOne({ _id: lobbyId });

    if (lobbyInfo === null) {
      res.status(400).json({ message: 'No active lobby found for given Id' });
      return;
    }

    if (
      !lobbyInfo.participants
        .map(x => x.toString())
        .includes(userWhoCancelledId.toString())
    ) {
      res
        .status(400)
        .json({ message: 'This user is not a member of the provided lobby' });
      return;
    }

    // check latest escrow from lobby
    const latestEscrow = await ESCROW.findOne(
      { lobbyId },
      {},
      { sort: { createdAt: -1 } }
    );

    if (latestEscrow === null) {
      Sentry.addBreadcrumb({
        category: 'game',
        data: { lobbyId, userWhoCancelledId },
        level: 'error',
      });

      Sentry.captureMessage(
        'While the game server was cancelling a game, the system could not find any escrow payment',
        { level: 'error' }
      );
      res.status(500).json({ message: 'Something went wrong' });
      return;
    }

    if (latestEscrow.paidOut) {
      res
        .status(200)
        .json({ message: 'Escrow has already been paid out to the winner' });
      return;
    }

    const session = await mongoose.startSession({
      defaultTransactionOptions: {
        writeConcern: { w: 'majority' },
        readConcern: { level: 'majority' },
      },
    });

    await session.withTransaction(async session => {
      try {
        const escrowCount = await ESCROW.countDocuments({ lobbyId });

        // check if both of them have paid and if they have started the game
        if (
          lobbyInfo.participants.length ===
          latestEscrow.playersThatHavePaid.length &&
          lobbyInfo.noOfGamesPlayed === escrowCount
        ) {
          const otherUsers = latestEscrow.playersThatHavePaid.filter(
            x => x.toString() !== userWhoCancelledId.toString()
          );

          const amountToCredit = Math.floor(
            latestEscrow.totalAmount / otherUsers.length
          );

          // to be paid to skyboard if more than 0
          const difference =
            latestEscrow.totalAmount - amountToCredit * otherUsers.length;

          if (difference > 0) {
            // there is going to be 1 admin, but if we do have multiple I'm sorting by createdAt to be safe
            await ADMIN.findOneAndUpdate(
              {},
              { $inc: { walletBalance: difference } },
              { session, sort: { createdAt: 1 } }
            );

            await ADMINTRANSACTION.create(
              [
                {
                  ref: uuidV4(),
                  amount: difference,
                  type: 'deposit',
                  status: 'completed',
                  description:
                    'There was a difference left after spliting the escrow payment to players',
                },
              ],
              { session }
            );
          }

          await USER.updateMany(
            { _id: { $in: otherUsers } },
            { $inc: { walletBalance: amountToCredit } },
            { session }
          );

          // create new transactions
          await TRANSACTION.create(
            otherUsers.map(x => ({
              amount: amountToCredit,
              description: 'Earnings from game',
              fee: 0,
              ref: uuidV4(),
              status: 'completed',
              total: amountToCredit,
              type: 'deposit',
              userId: x._id,
            })),
            { session }
          );

          // insert notification for the other users
          await NOTIFICATION.create(
            otherUsers.map(x => ({
              userId: x._id,
              body: 'You have received your earnings from a game, that was cancelled',
              title: 'Earnings from a cancelled game',
              image: process.env.SKYBOARD_LOGO as string,
            })),
            { session }
          );

          await LOBBY.updateOne(
            { _id: lobbyId },
            { $push: { winners: otherUsers } },
            { session }
          );
        } else if (
          lobbyInfo.participants.length ===
          latestEscrow.playersThatHavePaid.length &&
          lobbyInfo.noOfGamesPlayed < escrowCount
        ) {
          // refund everybody in the latestEscrow.playersThatHavePaid
          await USER.updateMany(
            { _id: { $in: latestEscrow.playersThatHavePaid } },
            { $inc: { walletBalance: lobbyInfo.wagerAmount } },
            { session }
          );

          // create new transactions
          await TRANSACTION.create(
            latestEscrow.playersThatHavePaid.map(x => ({
              amount: lobbyInfo.wagerAmount,
              description: 'Refund from game',
              fee: 0,
              ref: uuidV4(),
              status: 'completed',
              total: lobbyInfo.wagerAmount,
              type: 'deposit',
              userId: x._id,
            })),
            { session }
          );
        } else {
          Sentry.addBreadcrumb({
            category: 'game',
            data: { lobbyId, userWhoCancelledId },
            level: 'error',
          });

          Sentry.captureMessage(
            'while cancelling a game an unhandled condition was met',
            { level: 'error' }
          );

          throw Error('Something went wrong');
        }

        // update escrow as paid out
        await ESCROW.updateOne(
          { _id: latestEscrow._id },
          { $set: { paidOut: true } },
          { session }
        );

        // update the lobby as inactive, just to keep things simple
        await LOBBY.updateOne(
          { _id: lobbyId },
          { $set: { active: false } },
          { session }
        );

        await session.commitTransaction();
        res.status(200).json({ message: 'Game cancelled successfully' });
      } catch (error) {
        await session.abortTransaction();

        throw error;
      } finally {
        await session.endSession();
      }
    });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function top_games(_: Request, res: Response) {
  try {
    const firstDayOfCurrentWeek = new Date(
      new Date().setHours(0, 0, 0, 0) -
      new Date().getDay() * 24 * 60 * 60 * 1000
    );

    const pipeline: PipelineStage[] = [
      {
        $match: {
          createdAt: {
            $gte: firstDayOfCurrentWeek,
          },
        },
      },
      {
        $group: {
          _id: '$gameId',
          totalPlays: {
            $sum: 1,
          },
        },
      },
      {
        $lookup: {
          from: 'games',
          localField: '_id',
          foreignField: '_id',
          as: 'gameInfo',
        },
      },
      {
        $addFields: {
          gameInfo: {
            $arrayElemAt: ['$gameInfo', 0],
          },
        },
      },
      {
        $sort: {
          total: -1,
        },
      },
    ];

    const topGames = await LOBBY.aggregate(pipeline);

    res.status(200).json({ message: 'Success', data: topGames });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function top_gamers(_: Request, res: Response) {
  try {
    /* const firstDayOfCurrentWeek = new Date(
      new Date().setHours(0, 0, 0, 0) -
        new Date().getDay() * 24 * 60 * 60 * 1000
    ); */

    const pipeline: PipelineStage[] = [
      {
        $unwind: {
          path: '$winners',
        },
      },
      {
        $group: {
          _id: '$winners',
          totalWins: {
            $sum: 1,
          },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo',
          pipeline: [
            {
              $project: {
                username: 1,
                avatar: 1,
              },
            },
          ],
        },
      },
      {
        $addFields: {
          userInfo: {
            $arrayElemAt: ['$userInfo', 0],
          },
        },
      },
      {
        $match: {
          userInfo: { $ne: null },
        },
      },
      {
        $sort: {
          totalWins: -1,
        },
      },
      {
        $limit: 5
      }
    ];

    const topGamers = await LOBBY.aggregate(pipeline);

    res.status(200).json({ message: 'Success', data: topGamers });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function get_a_tournament_info(req: Request, res: Response) {
  try {
    const { tournamentId } = req.params;

    if (!isValidObjectId(tournamentId)) {
      res.status(400).json({ message: 'Invalid tournament id' });
      return;
    }

    const tournamentInfo = await TOURNAMENT.findOne(
      { _id: tournamentId },
      { winners: 0 }
    );

    if (!tournamentInfo) {
      res.status(404).json({ message: 'Tournament not found' });
      return;
    }

    res.status(200).json({ message: 'Success', data: tournamentInfo });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function see_all_tournaments(req: Request, res: Response) {
  try {
    // all tournaments still open for registration sorted by participants, prize, date,
    // trending (those with most participants that were created this week) etc.

    const { pageNo, sortBy } = req.query;

    const MAX_RESULTS = 250;
    let currentPage;

    if (typeof pageNo !== 'string' || isNaN(+pageNo) || +pageNo <= 0) {
      currentPage = 1;
    } else {
      currentPage = Math.floor(+pageNo);
    }

    const skip = (currentPage - 1) * MAX_RESULTS;

    let sortPipeline: PipelineStage[] = [];

    if (sortBy === 'noOfParticipants') {
      sortPipeline = [
        {
          $addFields: {
            noOfParticipants: {
              $size: '$participants',
            },
          },
        },
        {
          $sort: {
            noOfParticipants: -1,
          },
        },
        {
          $project: {
            noOfParticipants: 0,
          },
        },
      ];
    } else if (sortBy === 'prize') {
      sortPipeline = [
        {
          $addFields: {
            maxPrize: {
              $max: '$prizes',
            },
          },
        },
        {
          $sort: {
            maxPrize: -1,
          },
        },
        {
          $project: {
            maxPrize: 0,
          },
        },
      ];
    } else if (sortBy === 'date') {
      sortPipeline = [
        {
          $sort: {
            createdAt: -1,
          },
        },
      ];
    } else if (sortBy === 'trending') {
      const firstDayOfCurrentWeek = new Date(
        new Date().setHours(0, 0, 0, 0) -
        new Date().getDay() * 24 * 60 * 60 * 1000
      );

      sortPipeline = [
        {
          $match: {
            createdAt: {
              $gte: firstDayOfCurrentWeek,
            },
          },
        },
        {
          $addFields: {
            noOfParticipants: {
              $size: '$participants',
            },
          },
        },
        {
          $sort: {
            noOfParticipants: -1,
          },
        },
        {
          $project: {
            noOfParticipants: 0,
          },
        },
      ];
    }

    const pipeline: PipelineStage[] = [
      {
        $match: {
          isFullyCreated: true,
          $expr: {
            $gt: [
              { $add: ['$endDate', 1000 * 60 * 60 * 6] }, // endDate + 6 hours
              new Date(),
            ],
          },
        },
      },
      {
        $lookup: {
          from: 'games',
          localField: 'gameId',
          foreignField: '_id',
          as: 'gameInfo',
          pipeline: [
            {
              $project: {
                name: 1,
              },
            },
            {
              $addFields: {
                gameName: '$name',
              },
            },
          ],
        },
      },
      {
        $addFields: {
          gameInfo: {
            $arrayElemAt: ['$gameInfo', 0],
          },
        },
      },
      {
        $addFields: {
          finalDate: {
            $add: ['$endDate', 1000 * 60 * 60 * 6],
          },
          gameName: '$gameInfo.gameName',
        },
      },
      ...sortPipeline,
      {
        $skip: skip,
      },
      {
        $limit: MAX_RESULTS,
      },
    ];

    const tournaments = await TOURNAMENT.aggregate(pipeline);

    res.status(200).json({ message: 'Success', data: tournaments });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function join_tournament(req: Request, res: Response) {
  try {
    const { joiningCode } = req.body;
    const { userId } = req;

    // join a tournament (pay entry fee)
    if (typeof joiningCode !== 'string' || joiningCode.trim() === '') {
      res.status(400).json({ message: 'Invalid joining code' });
      return;
    }

    const tournamentInfo = await TOURNAMENT.findOne({
      joiningCode,
      isFullyCreated: true,
      hasStarted: false,
    });

    if (!tournamentInfo) {
      res.status(404).json({ message: 'Tournament not found' });
      return;
    }

    // check if user is already in the tournament
    if (
      tournamentInfo.participants
        .map(x => x.toString())
        .includes(userId?.toString() as string)
    ) {
      res.status(400).json({ message: 'You are already in this tournament' });
      return;
    }

    if (tournamentInfo.registrationDeadline < new Date()) {
      res
        .status(400)
        .json({ message: 'Registration has closed for this tournament' });
      return;
    }

    if (tournamentInfo.endDate < new Date()) {
      res.status(400).json({ message: 'This tournament has ended' });
      return;
    }

    // check user's balance if tournament has gateFee
    if (
      tournamentInfo.hasGateFee &&
      tournamentInfo.gateFee &&
      tournamentInfo.gateFee > 0
    ) {
      const userInfo = await USER.findOne({ _id: userId });

      if (!userInfo) {
        res.status(404).json({
          message: 'There was a problem with your account, try to login again',
        });
        return;
      }

      if (userInfo.walletBalance < tournamentInfo.gateFee) {
        res.status(400).json({
          message: `Insufficient balance, to join you need ${Math.round(tournamentInfo.gateFee / 100).toFixed(2)} naira`,
        });
        return;
      }
    }

    const session = await mongoose.startSession({
      defaultTransactionOptions: {
        writeConcern: { w: 'majority' },
        readConcern: { level: 'majority' },
      },
    });

    await session.withTransaction(async session => {
      try {
        if (
          tournamentInfo.hasGateFee &&
          tournamentInfo.gateFee &&
          tournamentInfo.gateFee > 0
        ) {
          // deduct the gate fee from the user's wallet
          await USER.updateOne(
            { _id: userId },
            { $inc: { walletBalance: -tournamentInfo.gateFee } },
            { session }
          );

          // create a new transaction entry
          await TRANSACTION.create(
            [
              {
                amount: tournamentInfo.gateFee,
                description: 'Moved money to escrow for tournament',
                fee: 0,
                ref: uuidV4(),
                status: 'completed',
                total: tournamentInfo.gateFee,
                type: 'withdrawal',
                userId: userId,
              },
            ],
            { session }
          );

          // create a new escrow if none exists, else update
          await TOURNAMENTESCROW.updateOne(
            {
              tournamentId: tournamentInfo._id,
              isPrize: false,
            },
            {
              $inc: { totalAmount: tournamentInfo.gateFee },
              $push: { playersThatHavePaid: userId },
            },
            { upsert: true, session }
          );
        }

        // update the tournament
        await TOURNAMENT.updateOne(
          { _id: tournamentInfo._id },
          { $push: { participants: userId } },
          { session }
        );

        await session.commitTransaction();

        res.status(200).json({
          message: 'You have joined the tournament',
          data: { joiningCode, _id: tournamentInfo._id },
        });
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        await session.endSession();
      }
    });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function fetch_my_fixtures_in_tournament(
  req: Request,
  res: Response
) {
  try {
    const { userId } = req;
    const { tournamentId } = req.params;

    if (!isValidObjectId(tournamentId)) {
      res.status(400).json({ message: 'Invalid tournament id' });
      return;
    }

    const tournamentInfo = await TOURNAMENT.findOne({
      participants: userId,
      _id: tournamentId,
    });

    if (!tournamentInfo) {
      res
        .status(404)
        .json({ message: 'Tournament not found, or you are not in it' });
      return;
    }

    // for each player in the players array fetch thier avatar and username from users
    const pipeline: PipelineStage[] = [
      {
        $match: {
          tournamentId: new ObjectId(tournamentId),
          players: new ObjectId(userId),
        },
      },
      {
        $unwind: '$players',
      },
      {
        $lookup: {
          from: 'users',
          localField: 'players',
          foreignField: '_id',
          as: 'playerDetails',
        },
      },
      {
        $unwind: '$playerDetails',
      },
      {
        $group: {
          _id: '$_id',
          players: {
            $push: {
              _id: '$players',
              username: '$playerDetails.username',
              avatar: '$playerDetails.avatar',
            },
          },
          joiningCode: {
            $first: '$joiningCode',
          },
          gameStarted: {
            $first: '$gameStarted',
          },
          createdAt: {
            $first: '$createdAt',
          },
          updatedAt: {
            $first: '$updatedAt',
          },
          __v: {
            $first: '$__v',
          },
          tournamentId: {
            $first: '$tournamentId',
          },
          winner: {
            $first: '$winner',
          },
        },
      },
    ];

    const fixtures = await TOURNAMENTFIXTURES.aggregate(pipeline);

    res.status(200).json({
      message: 'Tournament fixtures retrieved successfully',
      data: fixtures,
    });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function fetch_my_fixtures_in_tournament_lobby_code(
  req: Request,
  res: Response
) {
  try {
    const { userId } = req;
    const { tournamentId, lobbyCode } = req.params;

    if (!isValidObjectId(tournamentId)) {
      res.status(400).json({ message: 'Invalid tournament id' });
      return;
    }

    if (!lobbyCode) {
      res.status(400).json({ message: 'invalid lobby code' });
      return;
    }

    const tournamentInfo = await TOURNAMENT.findOne({
      participants: userId,
      _id: tournamentId,
    });

    if (!tournamentInfo) {
      res
        .status(404)
        .json({ message: 'Tournament not found, or you are not in it' });
      return;
    }

    // for each player in the players array fetch thier avatar and username from users
    const pipeline: PipelineStage[] = [
      {
        $match: {
          tournamentId: new ObjectId(tournamentId),
          players: new ObjectId(userId),
          joiningCode: lobbyCode,
        },
      },
      {
        $unwind: '$players',
      },
      {
        $lookup: {
          from: 'users',
          localField: 'players',
          foreignField: '_id',
          as: 'playerDetails',
        },
      },
      {
        $unwind: '$playerDetails',
      },
      {
        $group: {
          _id: '$_id',
          players: {
            $push: {
              _id: '$players',
              username: '$playerDetails.username',
              avatar: '$playerDetails.avatar',
            },
          },
          joiningCode: {
            $first: '$joiningCode',
          },
          gameStarted: {
            $first: '$gameStarted',
          },
          createdAt: {
            $first: '$createdAt',
          },
          updatedAt: {
            $first: '$updatedAt',
          },
          __v: {
            $first: '$__v',
          },
          tournamentId: {
            $first: '$tournamentId',
          },
          winner: {
            $first: '$winner',
          },
        },
      },
    ];

    const fixtures = await TOURNAMENTFIXTURES.aggregate(pipeline);

    res.status(200).json({
      message: 'Tournament fixtures retrieved successfully',
      data: fixtures,
    });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function join_tournament_lobby(req: Request, res: Response) {
  try {
    // join a tournament's fixture/lobby no payment
    // when a player joins a lobby for a fixture the other party will be notified
    const { userId } = req;
    const { tournamentId, lobbyCode } = req.params;

    if (!userId || !isValidObjectId(userId)) {
      res
        .status(400)
        .json({ message: 'Something went wrong, try to login again' });
      return;
    }

    const userInfo = await USER.findOne({ _id: userId });

    if (!userInfo) {
      res.status(404).json({
        message: 'There was a problem with your account, try to login again',
      });
      return;
    }

    if (!isValidObjectId(tournamentId)) {
      res.status(400).json({ message: 'Invalid tournament id' });
      return;
    }

    if (typeof lobbyCode !== 'string' || lobbyCode.trim() === '') {
      res.status(400).json({ message: 'Invalid lobby code' });
      return;
    }

    const tournamentInfo = await TOURNAMENT.findOne({ _id: tournamentId });

    if (!tournamentInfo) {
      res.status(404).json({ message: 'Tournament not found' });
      return;
    }

    if (tournamentInfo.endDate < new Date()) {
      res.status(400).json({ message: 'This tournament has ended' });
      return;
    }

    // check if this fixture exists and I am a part of it
    const fixtureInfo = await TOURNAMENTFIXTURES.findOne({
      tournamentId,
      joiningCode: lobbyCode,
      players: userId,
    });

    if (!fixtureInfo) {
      res.status(404).json({
        message:
          'You do not have this as a fixture, please check the lobby code or tournament and try again',
      });
      return;
    }

    // check if the fixture has started
    if (fixtureInfo.gameStarted) {
      res.status(400).json({ message: 'This fixture has already started' });
      return;
    }

    // notify the other player
    const otherPlayer = fixtureInfo.players.filter(
      x => x.toString() !== userId.toString()
    );

    const otherPlayerInfo = await USER.findOne({ _id: otherPlayer });

    if (!otherPlayerInfo) {
      res.status(404).json({
        message: 'Something went wrong while notifying the other player',
      });
      return;
    }

    await send_mail(
      otherPlayerInfo.email,
      'fixture-notification',
      'Fixture Notification',
      {
        tournamentName: tournamentInfo.name,
        lobbyCode,
        username: otherPlayerInfo.username,
        waitingPlayerName: userInfo.username,
      }
    );

    // TODO: push notification later

    res.status(200).json({
      message:
        'You have joined the fixture, a notification has been sent to the other player, you game should start soon',
    });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function see_all_tournaments_i_am_in(req: Request, res: Response) {
  try {
    const { userId } = req;

    const tournaments = await TOURNAMENT.find({
      participants: userId,
      hasEnded: false,
    });

    res.status(200).json({
      message: 'Tournaments retrieved successfully',
      data: tournaments,
    });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function start_tournament_game(req: Request, res: Response) {
  try {
    const { fixtureId } = req.body;

    if (!isValidObjectId(fixtureId)) {
      res.status(400).json({ message: 'Invalid fixture id' });
      return;
    }

    const fixtureInfo = await TOURNAMENTFIXTURES.findOne({
      _id: fixtureId,
    });

    if (!fixtureInfo) {
      res.status(404).json({ message: 'Fixture not found' });
      return;
    }

    if (fixtureInfo.gameStarted) {
      res.status(400).json({ message: 'This fixture has already started' });
      return;
    }

    const tournamentInfo = await TOURNAMENT.findOne({
      _id: fixtureInfo.tournamentId,
    });

    if (!tournamentInfo) {
      res.status(404).json({ message: 'Tournament not found' });
      return;
    }

    if (tournamentInfo.endDate < new Date()) {
      res.status(400).json({ message: 'This tournament has ended' });
      return;
    }

    await TOURNAMENTFIXTURES.updateOne(
      { _id: fixtureInfo._id },
      { $set: { gameStarted: true } }
    );

    res.status(200).json({ message: 'Game started successfully' });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function cancel_tournament_game(req: Request, res: Response) {
  try {
    const { fixtureId, playerWhoCancelledId } = req.body;

    if (!isValidObjectId(fixtureId)) {
      res.status(400).json({ message: 'Invalid fixture id' });
      return;
    }

    if (!isValidObjectId(playerWhoCancelledId)) {
      res.status(400).json({ message: 'Invalid player id' });
      return;
    }

    const fixtureInfo = await TOURNAMENTFIXTURES.findOne({
      _id: fixtureId,
    });

    if (!fixtureInfo) {
      res.status(404).json({ message: 'Fixture not found' });
      return;
    }

    if (!fixtureInfo.gameStarted) {
      res
        .status(400)
        .json({ message: 'You can not cancel a game that has not started' });
      return;
    }

    if (fixtureInfo.winner) {
      res.status(400).json({ message: 'This game has already been won' });
      return;
    }

    if (
      !fixtureInfo.players.map(x => x.toString()).includes(playerWhoCancelledId)
    ) {
      res.status(400).json({
        message: 'The specified player who cancelled is not in this fixture',
      });
      return;
    }

    const tournamentInfo = await TOURNAMENT.findOne({
      _id: fixtureInfo.tournamentId,
    });

    if (!tournamentInfo) {
      res.status(404).json({ message: 'Tournament not found' });
      return;
    }

    if (tournamentInfo.endDate < new Date()) {
      res.status(400).json({ message: 'This tournament has ended' });
      return;
    }

    const otherPlayer = fixtureInfo.players.filter(
      x => x.toString() !== playerWhoCancelledId.toString()
    );

    await TOURNAMENTFIXTURES.updateOne(
      { _id: fixtureInfo._id },
      { $set: { winner: otherPlayer[0] } }
    );

    res.status(200).json({ message: 'Game cancelled successfully' });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function get_top_active_games(_: Request, res: Response) {
  try {
    const pipeline: PipelineStage[] = [
      {
        $match: {
          active: true,
        },
      },
      {
        $group: {
          _id: '$gameId',
          totalPlays: {
            $sum: 1,
          },
        },
      },
      {
        $lookup: {
          from: 'games',
          localField: '_id',
          foreignField: '_id',
          as: 'gameInfo',
        },
      },
      {
        $addFields: {
          gameInfo: {
            $arrayElemAt: ['$gameInfo', 0],
          },
        },
      },
      {
        $sort: {
          total: -1,
        },
      },
    ];

    const topGamesNow = await LOBBY.aggregate(pipeline);

    res.status(200).json({ message: 'Success', data: topGamesNow });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function get_gamers(req: Request, res: Response) {
  try {
    const { q: query } = req.query;

    if (typeof query === 'string' && query.length <= 2) {
      res
        .status(400)
        .json({ message: 'Query must be at least 2 characters long' });
    }

    const filter: { [key: string]: any } = {
      accountIsActive: true, // this ensures the user can play
      isCelebrity: false,
    };
    if (query) {
      filter['username'] = {
        $regex: query,
        $options: 'i',
      };
    }

    const gamers = await USER.aggregate([
      { $match: filter },
      { $project: { _id: 1, username: 1, avatar: 1 } },
      { $limit: 100 },
      {
        $lookup: {
          from: 'lobbies',
          localField: '_id',
          foreignField: 'winners',
          as: 'winnings',
          let: { playerInQuestion: '$_id' },
          pipeline: [
            {
              $unwind: '$winners',
            },
            {
              $match: {
                $expr: {
                  $eq: ['$winners', '$$playerInQuestion'],
                },
              },
            },
          ],
        },
      },
      {
        $addFields: {
          numberOfWins: { $size: '$winnings' },
        },
      },
      {
        $project: {
          winnings: 0,
        },
      },
    ]);

    res.status(200).json({ message: 'Success', data: gamers });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function select_a_user_to_play_with(req: Request, res: Response) {
  try {
    const { userId } = req;
    const { playerId, lobbyId } = req.body;

    if (!isValidObjectId(playerId)) {
      res.status(400).json({ message: 'Invalid player id' });
      return;
    }

    if (!isValidObjectId(lobbyId)) {
      res.status(400).json({ message: 'Invalid lobby id' });
      return;
    }

    const playerInfo = await USER.findOne({ _id: playerId });
    if (!playerInfo) {
      res.status(404).json({ message: 'Player not found' });
      return;
    }

    const userInfo = await USER.findOne({ _id: userId });
    if (!userInfo) {
      res
        .status(500)
        .json({ message: 'Something went wrong, please contact support' });
      return;
    }

    const lobbyInfo = await LOBBY.findOne({ _id: lobbyId });
    if (!lobbyInfo) {
      res.status(404).json({ message: 'Lobby not found' });
      return;
    }

    // check that I own the lobby
    if (lobbyInfo.creatorId.toString() !== userId) {
      res.status(400).json({ message: 'You do not own this lobby' });
      return;
    }

    // check if the player has an active account (not neccesarily online)
    if (!playerInfo.accountIsActive) {
      res.status(400).json({ message: "This player's account is not active" });
      return;
    }

    // send invite to the player
    await send_mail(playerInfo.email, 'game-invite', 'Game Invite', {
      username: playerInfo.username,
      lobbyCode: lobbyInfo.code,
      inviter: userInfo.username,
    });

    res.status(200).json({
      message: 'Invite sent successfully',
      data: {
        username: userInfo.username,
        userAvatar: userInfo.avatar,
        opponentUsername: playerInfo.username,
        opponentAvatar: playerInfo.avatar,
      },
    });
  } catch (error) {
    handle_error(error, res);
  }
}
