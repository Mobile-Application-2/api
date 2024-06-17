import TICKET from '../models/ticket.model';
import USER from '../models/user.model';
import {handle_error} from '../utils/handle-error';
import {Request, Response} from 'express';
import send_mail from '../utils/nodemailer';
import NOTIFICATION from '../models/notification.model';
import isEmail from 'validator/lib/isEmail';
import mongoose, {isValidObjectId} from 'mongoose';
import TRANSACTION from '../models/transaction.model';
import WAITLIST from '../models/waitlist.model';
import GAME from '../models/game.model';
import GAMERATING from '../models/game-rating.model';
import {generate_lobby_code} from '../utils/generate-lobby-code';
import LOBBY from '../models/lobby.model';
import ESCROW from '../models/escrow.model';

export async function search_users(req: Request, res: Response) {
  try {
    const {q: searchQuery} = req.query;

    if (typeof searchQuery !== 'string' || searchQuery.trim() === '') {
      res.status(400).json({mesage: 'Please specify a search query'});
      return;
    }

    // fetch results based on only usernames
    const users = await USER.find(
      {
        username: {$regex: searchQuery, $options: 'i'},
      },
      {username: 1, avatar: 1, bio: 1},
      {limit: 50}
    );

    res.status(200).json({message: 'Success', data: users});
  } catch (error) {
    handle_error(Error, res);
  }
}

export async function create_a_ticket(req: Request, res: Response) {
  try {
    const {fullName, email, message} = req.body;
    const {userId} = req;

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

    res.status(201).json({message: 'Ticket filed successfully'});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function refer_a_friend(req: Request, res: Response) {
  try {
    const {email} = req.body;
    const {userId} = req;

    if (!email || isEmail(email) === false) {
      res.status(400).json({message: 'Please provide a valid email address'});
      return;
    }

    const userInfo = await USER.findOne({_id: userId});

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
      res.status(400).json({message: 'This email is already signed up'});
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

    res.status(200).json({message: 'Referral sent successfully'});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function get_notifications(req: Request, res: Response) {
  try {
    const {userId} = req;
    const {pageNo} = req.query;

    const MAX_RESULTS = 250;
    let currentPage;

    if (typeof pageNo !== 'string' || isNaN(+pageNo) || +pageNo <= 0) {
      currentPage = 1;
    } else {
      currentPage = Math.floor(+pageNo);
    }

    const skip = (currentPage - 1) * MAX_RESULTS;

    const notifications = await NOTIFICATION.find({userId})
      .sort({createdAt: -1})
      .skip(skip)
      .limit(MAX_RESULTS);

    const notificationIds = notifications.map(notification => notification._id);

    // mark all notifications as read
    await NOTIFICATION.updateMany({_id: {$in: notificationIds}}, {read: true});

    res.status(200).json({message: 'Success', data: notifications});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function delete_notification(req: Request, res: Response) {
  try {
    const {userId} = req;
    const {id: notificationId} = req.params;

    if (!isValidObjectId(notificationId)) {
      res.status(400).json({message: 'Invalid notification id'});
      return;
    }

    const notification = await NOTIFICATION.findOne({_id: notificationId});

    if (!notification) {
      res.status(404).json({message: 'Notification not found'});
      return;
    }

    if (!notification.userId.equals(userId)) {
      res
        .status(403)
        .json({message: 'You are not authorized to delete this notification'});
      return;
    }

    await notification.deleteOne({_id: notificationId});

    res.status(200).json({message: 'Notification deleted successfully'});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function delete_all_notifications(req: Request, res: Response) {
  try {
    const {userId} = req;

    await NOTIFICATION.deleteMany({userId});

    res.status(200).json({message: 'All notifications deleted successfully'});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function get_transactions(req: Request, res: Response) {
  try {
    const {userId} = req;
    const {pageNo} = req.query;

    const MAX_RESULTS = 250;
    let currentPage;

    if (typeof pageNo !== 'string' || isNaN(+pageNo) || +pageNo <= 0) {
      currentPage = 1;
    } else {
      currentPage = Math.floor(+pageNo);
    }

    const skip = (currentPage - 1) * MAX_RESULTS;

    const transactions = await TRANSACTION.find({userId})
      .sort({createdAt: -1})
      .skip(skip)
      .limit(MAX_RESULTS);

    // not returing the total number of transactions so you can use infinite scroll
    res.status(200).json({message: 'Success', data: transactions});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function join_waitlist(req: Request, res: Response) {
  try {
    const {email} = req.body;

    if (!email || isEmail(email) === false) {
      res.status(400).json({message: 'Please provide a valid email address'});
      return;
    }

    // check if the email is already in the waitlist or already signed up
    const userExists = await USER.findOne({email});

    if (userExists) {
      res.status(400).json({message: 'You are already signed up'});
      return;
    }

    const alreadyInWaitlist = await WAITLIST.findOne({email});

    if (alreadyInWaitlist) {
      res.status(400).json({message: 'You are already in the waitlist'});
      return;
    }

    await WAITLIST.create({email});

    await send_mail(email, 'waitlist', 'You have been added to the waitlist', {
      email,
    });

    res.status(201).json({message: 'You have been added to the waitlist'});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function get_games(_: Request, res: Response) {
  try {
    const games = await GAME.find();

    res.status(200).json({message: 'Success', data: games});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function get_game(req: Request, res: Response) {
  try {
    const {gameId} = req.params;

    if (!isValidObjectId(gameId)) {
      res.status(400).json({message: 'Invalid game id'});
      return;
    }

    const game = await GAME.findOne({_id: gameId});

    if (!game) {
      res.status(404).json({message: 'Game not found'});
      return;
    }

    res.status(200).json({message: 'Success', data: game});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function rate_a_game(req: Request, res: Response) {
  try {
    const {gameId, rating} = req.body;
    const {userId} = req;

    if (!isValidObjectId(gameId)) {
      res.status(400).json({message: 'Invalid game id'});
      return;
    }

    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      res.status(400).json({message: 'Invalid rating'});
      return;
    }

    const gameInfo = await GAME.findOne({_id: gameId});

    if (!gameInfo) {
      res.status(404).json({message: 'Game not found'});
      return;
    }

    const session = await mongoose.startSession({
      defaultTransactionOptions: {
        writeConcern: {w: 'majority'},
        readConcern: {level: 'majority'},
      },
    });

    await session.withTransaction(async session => {
      try {
        await GAMERATING.updateOne(
          {gameId, userId},
          {rating},
          {upsert: true, session}
        );

        // get new average rating
        const pipeline = [
          {
            $match: {gameId: gameInfo._id},
          },
          {
            $group: {
              _id: null,
              avgRating: {$avg: '$rating'},
            },
          },
        ];

        const [{avgRating}] = await GAMERATING.aggregate(pipeline);

        await GAME.updateOne(
          {_id: gameInfo._id},
          {averageRating: avgRating},
          {session}
        );

        await session.commitTransaction();
        res.status(201).json({message: 'Game rated successfully'});
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
    const {userId} = req;
    const {gameId, wagerAmount} = req.body;

    if (!isValidObjectId(gameId)) {
      res.status(400).json({message: 'Invalid game id'});
      return;
    }

    const gameInfo = await GAME.findOne({_id: gameId});

    if (!gameInfo) {
      res.status(404).json({message: 'Game not found'});
      return;
    }

    // find a way to ensure this will not be decimal (fractional) should always be a full integer
    const minWager = 100000; // 1k naira
    if (typeof wagerAmount !== 'number') {
      res.status(400).json({message: 'Invalid wager amount'});
      return;
    }

    if (wagerAmount < minWager) {
      res
        .status(400)
        .json({message: 'Wager amount must be at least 1000 naira'});
      return;
    }

    // check user's balance
    const userInfo = await USER.findOne({_id: userId});

    if (!userInfo) {
      res.status(404).json({
        message: 'There was a problem with your account, try to login again',
      });
      return;
    }

    if (userInfo.walletBalance < wagerAmount) {
      res.status(400).json({message: 'Insufficient balance'});
      return;
    }

    const session = await mongoose.startSession({
      defaultTransactionOptions: {
        writeConcern: {w: 'majority'},
        readConcern: {level: 'majority'},
      },
    });

    await session.withTransaction(async session => {
      try {
        // deduct the wager amount from the user's wallet
        await USER.updateOne(
          {_id: userId},
          {$inc: {walletBalance: -wagerAmount}},
          {session}
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
          {session}
        );

        // create a new escrow
        await ESCROW.create(
          [
            {
              lobbyId: lobbyInfo[0]._id,
              totalAmount: wagerAmount,
            },
          ],
          {session}
        );

        await session.commitTransaction();

        res.status(201).json({
          message: 'Lobby created successfully',
          data: lobbyInfo[0].code,
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

export async function join_lobby(req: Request, res: Response) {
  try {
    const {userId} = req;
    const {lobbyCode} = req.body;

    // check user's balance
    const userInfo = await USER.findOne({_id: userId});

    if (!userInfo) {
      res.status(404).json({
        message: 'There was a problem with your account, try to login again',
      });
      return;
    }

    // check lobby code
    if (typeof lobbyCode !== 'string' || lobbyCode.trim() === '') {
      res.status(400).json({message: 'Invalid lobby code'});
      return;
    }

    type updatedGameId = {_id: mongoose.Types.ObjectId; maxPlayers: number};
    const lobbyInfo = await LOBBY.findOne({
      code: lobbyCode,
      active: true,
    }).populate<{gameId: updatedGameId}>('gameId', 'maxPlayers');

    if (!lobbyInfo) {
      res.status(404).json({message: 'No active lobby found with that code'});
      return;
    }

    // check if user is already in the lobby
    if (
      lobbyInfo.participants.map(x => x.toString()).includes(userId as string)
    ) {
      res.status(400).json({message: 'You are already in this lobby'});
      return;
    }

    // check if max players have been reached
    if (lobbyInfo.participants.length >= lobbyInfo.gameId.maxPlayers) {
      res.status(400).json({message: 'This lobby is full'});
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
        writeConcern: {w: 'majority'},
        readConcern: {level: 'majority'},
      },
    });

    await session.withTransaction(async session => {
      try {
        // deduct the wager amount from the user's wallet
        await USER.updateOne(
          {_id: userId},
          {$inc: {walletBalance: -lobbyInfo.wagerAmount}},
          {session}
        );

        // update the lobby
        await LOBBY.updateOne(
          {code: lobbyCode, active: true},
          {$push: {participants: userId}},
          {session}
        );

        // update escrow
        await ESCROW.updateOne(
          {lobbyId: lobbyInfo._id},
          {$inc: {totalAmount: lobbyInfo.wagerAmount}},
          {session}
        );

        await session.commitTransaction();

        res
          .status(200)
          .json({message: 'You have joined the lobby', data: lobbyCode});
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
