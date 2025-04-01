import {Request, Response} from 'express';
import {handle_error} from '../utils/handle-error';
import TOURNAMENT from '../models/tournament.model';
import mongoose, {PipelineStage, isValidObjectId} from 'mongoose';
import GAME from '../models/game.model';
import USER from '../models/user.model';
import TRANSACTION from '../models/transaction.model';
import {v4 as uuidV4} from 'uuid';
import TOURNAMENTESCROW from '../models/tournament-escrow.model';
import generate_tournament_fixtures from '../utils/generate-fixtures';
import crypto from 'crypto';
import TOURNAMENTFIXTURES from '../models/tournament-fixtures.model';
import {publish_to_queue} from '../utils/rabbitmq';
import TOURNAMENTTTL from '../models/tournament-ttl.model';
import { agenda } from '../agenda/agenda';
const ObjectId = mongoose.Types.ObjectId;

export async function get_my_tournaments(req: Request, res: Response) {
  try {
    const {userId} = req;

    const tournaments = await TOURNAMENT.find({creatorId: userId});

    res
      .status(200)
      .json({message: 'Tournaments retrieved successfully', data: tournaments});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function get_a_tournament(req: Request, res: Response) {
  try {
    const {userId} = req;
    const {tournamentId} = req.params;

    if (!isValidObjectId(tournamentId)) {
      res.status(400).json({message: 'Invalid tournament id'});
      return;
    }

    const tournamentInfo = await TOURNAMENT.findOne({
      creatorId: userId,
      _id: tournamentId,
    });

    if (!tournamentInfo) {
      res.status(404).json({message: 'Tournament not found'});
      return;
    }

    res.status(200).json({
      message: 'Tournament retrieved successfully',
      data: tournamentInfo,
    });
  } catch (error) {
    handle_error(error, res);
  }
}

// final winners
export async function get_tournament_winners(req: Request, res: Response) {
  try {
    const {userId} = req;
    const {tournamentId} = req.params;

    if (!isValidObjectId(tournamentId)) {
      res.status(400).json({message: 'Invalid tournament id'});
      return;
    }

    // check that torunament exists
    const tournamentInfo = await TOURNAMENT.findOne({
      creatorId: userId,
      _id: tournamentId,
    });

    if (!tournamentInfo) {
      res.status(404).json({message: 'Tournament not found'});
      return;
    }

    const pipeline: PipelineStage[] = [
      {
        $match: {
          creatorId: new ObjectId(userId),
          _id: new ObjectId(tournamentId),
        },
      },
      {
        $unwind: '$winners',
      },
      {
        $lookup: {
          from: 'users',
          localField: 'winners',
          foreignField: '_id',
          as: 'winner',
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
          winner: {
            $arrayElemAt: ['$winner', 0],
          },
        },
      },
      {
        $replaceRoot: {
          newRoot: '$winner',
        },
      },
    ];

    const winners = await TOURNAMENT.aggregate(pipeline);

    res
      .status(200)
      .json({message: 'Winners retrieved successfully', data: winners});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function get_tournament_participants(req: Request, res: Response) {
  try {
    const {userId} = req;
    const {tournamentId} = req.params;

    if (!isValidObjectId(tournamentId)) {
      res.status(400).json({message: 'Invalid tournament id'});
      return;
    }

    const tournamentInfo = await TOURNAMENT.findOne({
      creatorId: userId,
      _id: tournamentId,
    });

    if (!tournamentInfo) {
      res.status(404).json({message: 'Tournament not found'});
      return;
    }

    const pipeline: PipelineStage[] = [
      {
        $match: {
          creatorId: new ObjectId(userId),
          _id: new ObjectId(tournamentId),
        },
      },
      {
        $unwind: '$participants',
      },
      {
        $lookup: {
          from: 'users',
          localField: 'participants',
          foreignField: '_id',
          as: 'participant',
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
          participant: {
            $arrayElemAt: ['$participant', 0],
          },
        },
      },
      {
        $replaceRoot: {
          newRoot: '$participant',
        },
      },
    ];

    const participants = await TOURNAMENT.aggregate(pipeline);

    res.status(200).json({
      message: 'Participants retrieved successfully',
      data: participants,
    });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function create_tournament(req: Request, res: Response) {
  try {
    const {userId} = req;
    const tournamentInfo = req.body;

    if (!tournamentInfo || typeof tournamentInfo !== 'object') {
      res.status(400).json({message: 'Please provide tournament information'});
      return;
    }

    const allowedFields = [
      'name',
      'gameId',
      'registrationDeadline',
      'endDate',
      'noOfGamesToPlay',
      'noOfWinners',
      'hasGateFee',
      'startDate'
    ];

    if (!Object.prototype.hasOwnProperty.call(tournamentInfo, 'hasGateFee')) {
      tournamentInfo.hasGateFee = false;
    }

    if (!Object.prototype.hasOwnProperty.call(tournamentInfo, 'noOfGamesToPlay')) {
      tournamentInfo.noOfGamesToPlay = 100;
    }

    const fields = Object.keys(tournamentInfo);

    console.log(fields);

    const hasValidFields = fields.every(field => allowedFields.includes(field));

    console.log("has valid fields", hasValidFields);

    const hasAllRequiredFields = allowedFields.every(field => fields.includes(field) );

    console.log("has req fields", hasAllRequiredFields);

    if (!hasValidFields || !hasAllRequiredFields) {
      console.log("invalid information");
      
      res.status(400).json({
        message: 'Please provide valid tournament information',
      });
      return;
    }

    console.log("end", tournamentInfo.endDate);
    console.log("reg deadline", tournamentInfo.registrationDeadline);
    // check that endDate ahead of registrationDeadline
    if (
      new Date(tournamentInfo.endDate).getTime() <=
      new Date(tournamentInfo.registrationDeadline).getTime()
    ) {
      res
        .status(400)
        .json({message: 'End date must be ahead of registration deadline'});
      return;
    }

    // check gameId
    if (!isValidObjectId(tournamentInfo.gameId)) {
      res.status(400).json({message: 'Invalid game ID'});
      return;
    }

    const gameInfo = await GAME.findOne({_id: tournamentInfo.gameId});

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
        // create tournament
        const newTournament = await TOURNAMENT.create(
          [
            {
              ...tournamentInfo,
              creatorId: userId,
            },
          ],
          {session}
        );

        // create ttl
        await TOURNAMENTTTL.create(
          [
            {
              tournamentId: newTournament[0]._id,
              expiresAt: new Date(tournamentInfo.endDate),
            },
          ],
          {session}
        );

        await session.commitTransaction();

        // Schedule the tournament start
        await agenda.schedule(new Date(newTournament[0].startDate), "start_tournament", {
          tournamentId: newTournament[0]._id.toString(),
        });

        res.status(201).json({
          message: 'Tournament created successfully',
          data: newTournament[0],
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

export async function update_prizes_to_tournament(req: Request, res: Response) {
  try {
    const {userId} = req;
    const {tournamentId} = req.params;
    const {prizes, hasGateFee, gateFee} = req.body;

    if (!isValidObjectId(tournamentId)) {
      res.status(400).json({message: 'Invalid tournament id'});
      return;
    }

    const tournamentInfo = await TOURNAMENT.findOne({
      creatorId: userId,
      _id: tournamentId,
    });

    if (!tournamentInfo) {
      res.status(404).json({message: 'Tournament not found'});
      return;
    }

    if (tournamentInfo.endDate < new Date()) {
      res.status(400).json({message: 'Tournament has already ended'});
      return;
    }

    if (tournamentInfo.prizes.length) {
      res.status(400).json({message: 'Prizes have already been set'});
      return;
    }

    if (!prizes || !Array.isArray(prizes)) {
      res.status(400).json({message: 'Please provide valid prizes'});
      return;
    }

    const prizesAreValid = prizes.every(
      prize => typeof prize === 'number' && prize > 0 && Number.isInteger(prize)
    );

    if (!prizesAreValid) {
      res.status(400).json({message: 'Please provide valid prizes'});
      return;
    }

    if (prizes.length !== tournamentInfo.noOfWinners) {
      res.status(400).json({
        message: 'Please provide prizes for all winners',
      });
      return;
    }

    // check that I have this much money
    const totalPrize = prizes.reduce((acc, prize) => acc + prize, 0);

    const userInfo = await USER.findOne({_id: userId});

    if (!userInfo) {
      res.status(404).json({
        message: 'There was a problem with your account, try to login again',
      });
      return;
    }

    if (userInfo.walletBalance < totalPrize) {
      res.status(400).json({
        message: `Insufficient funds in your wallet to pay the winners, you need at least ${Math.round(totalPrize / 100).toFixed(2)} naira to pay the winners`,
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
        // deduct the money from my wallet
        await USER.updateOne(
          {_id: userId},
          {
            $inc: {
              walletBalance: -totalPrize,
            },
          },
          {session}
        );

        // create a transaction
        await TRANSACTION.create(
          [
            {
              amount: totalPrize,
              description: 'Moved money to escrow for tournament prize',
              fee: 0,
              ref: uuidV4(),
              status: 'completed',
              total: totalPrize,
              type: 'withdrawal',
              userId: userId,
            },
          ],
          {session}
        );

        // create an escrow payment
        await TOURNAMENTESCROW.create(
          [
            {
              tournamentId: tournamentInfo._id,
              totalAmount: totalPrize,
              playersThatHavePaid: [userId],
              isPrize: true,
            },
          ],
          {session}
        );

        const update = {
          prizes,
          gateFee: null,
          isFullyCreated: false,
          hasGateFee: hasGateFee
        };

        if(hasGateFee) {
          update.gateFee = gateFee;
        }

        // so the order doesn't matter
        if (tournamentInfo.joiningCode) {
          update['isFullyCreated'] = true;
        }

        // update
        await TOURNAMENT.updateOne(
          {_id: tournamentId},
          {$set: update},
          {session}
        );

        await session.commitTransaction();

        res.status(200).json({message: 'Prizes updated successfully'});
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

export async function update_tournament_code(req: Request, res: Response) {
  try {
    const {userId} = req;
    const {tournamentId} = req.params;
    const {joiningCode} = req.body;

    if (!isValidObjectId(tournamentId)) {
      res.status(400).json({message: 'Invalid tournament id'});
      return;
    }

    const tournamentInfo = await TOURNAMENT.findOne({
      creatorId: userId,
      _id: tournamentId,
    });

    if (!tournamentInfo) {
      res.status(404).json({message: 'Tournament not found'});
      return;
    }

    if (tournamentInfo.endDate < new Date()) {
      res.status(400).json({message: 'Tournament has already ended'});
      return;
    }

    if (
      !joiningCode ||
      typeof joiningCode !== 'string' ||
      joiningCode.trim().length === 0
    ) {
      res.status(400).json({message: 'Please provide a valid joining code'});
      return;
    }

    // check that it is unique
    const codeExists = await TOURNAMENT.findOne({
      joiningCode,
    });

    if (codeExists && codeExists._id.toString() === tournamentId) {
      res.status(400).json({
        message: 'Joining code is already in use by this tournament',
      });
      return;
    }

    if (codeExists) {
      res.status(400).json({
        message: 'Joining code is already in use by another tournament',
      });
      return;
    }

    // so the order doesn't matter
    const update = {
      joiningCode,
      isFullyCreated: false,
    };

    // the model is now complete
    if (tournamentInfo.prizes.length) {
      update['isFullyCreated'] = true;
    }

    // update
    await TOURNAMENT.updateOne(
      {_id: tournamentId},
      {
        $set: update,
      }
    );

    res.status(200).json({message: 'Joining code updated successfully'});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function get_players_with_most_wins_in_my_tournaments(
  req: Request,
  res: Response
) {
  try {
    const {userId} = req;

    const pipeline: PipelineStage[] = [
      {
        $match: {
          creatorId: new ObjectId(userId),
        },
      },
      {
        $unwind: '$winners',
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
          as: 'user',
        },
      },
      {
        $addFields: {
          user: {
            $arrayElemAt: ['$user', 0],
          },
        },
      },
      {
        $project: {
          _id: 0,
          username: '$user.username',
          avatar: '$user.avatar',
          totalWins: 1,
        },
      },
      {
        $sort: {
          totalWins: -1,
        },
      },
    ];

    const players = await TOURNAMENT.aggregate(pipeline);

    res.status(200).json({
      message: 'Players with most wins retrieved successfully',
      data: players,
    });
  } catch (error) {
    handle_error(error, res);
  }
}

export async function start_a_tournament(req: Request, res: Response) {
  try {
    const {userId} = req;
    const {tournamentId} = req.params;

    if (!isValidObjectId(tournamentId)) {
      res.status(400).json({message: 'Invalid tournament id'});
      return;
    }

    const tournamentInfo = await TOURNAMENT.findOne({
      creatorId: userId,
      _id: tournamentId,
    });

    if (!tournamentInfo) {
      res.status(404).json({message: 'Tournament not found'});
      return;
    }

    if (tournamentInfo.hasStarted) {
      res.status(400).json({message: 'Tournament has already started'});
      return;
    }

    if (!tournamentInfo.isFullyCreated) {
      res.status(400).json({message: 'Tournament is not fully created yet'});
      return;
    }

    if (tournamentInfo.endDate < new Date()) {
      res.status(400).json({message: 'Tournament has already ended'});
      return;
    }

    // check that tournament has players and even number of players
    // in the future we might add a logic to pad the players with bots to form an even number
    if (
      !tournamentInfo.participants.length ||
      tournamentInfo.participants.length % 2 !== 0
    ) {
      res
        .status(400)
        .json({message: 'Tournament must have an even number of players'});
      return;
    }

    // start the tournament
    const session = await mongoose.startSession({
      defaultTransactionOptions: {
        writeConcern: {w: 'majority'},
        readConcern: {level: 'majority'},
      },
    });

    await session.withTransaction(async session => {
      try {
        await TOURNAMENT.updateOne(
          {_id: tournamentId},
          {
            $set: {
              hasStarted: true,
            },
          },
          {session}
        );

        // generate fixtures (leaving this as round-based generation might be useful in the future) for now I'll flatten the answer
        const fixtures = generate_tournament_fixtures(
          tournamentInfo.participants.map(id => id.toString()),
          tournamentInfo.noOfGamesToPlay
        ).flat();

        const fixtureNotifications: {
          [key: string]: {
            opponent: string;
            joiningCode: string;
            tournamentId: string;
          }[];
        } = {};

        // create an entry for each fixture
        const bulkEntry = fixtures.map(fixture => {
          const joiningCode = crypto
            .createHash('sha256')
            .update(fixture.join(''))
            .digest('base64')
            .slice(0, 6);

          fixture.forEach(player => {
            if (!fixtureNotifications[player]) {
              fixtureNotifications[player] = [];
            }

            const opponent = fixture.find(p => p !== player);

            fixtureNotifications[player].push({
              tournamentId,
              opponent: opponent as string,
              joiningCode,
            });
          });

          return {
            tournamentId,
            joiningCode,
            players: fixture,
          };
        });

        await TOURNAMENTFIXTURES.create(bulkEntry, {session});

        // and after the fixtures are entered every player will be notified of all thier fixtures and the players they are playing against and code
        // fetch the username for all the players
        const playerUsernameAndEmail = await USER.find(
          {_id: {$in: Object.keys(fixtureNotifications)}},
          {username: 1, email: 1},
          {session}
        );

        // convert the usernames to an object such that the key is the id and the value is the username
        const playerUsernameAndEmailMap: {
          [key: string]: {username: string; email: string};
        } = {};

        playerUsernameAndEmail.forEach(user => {
          playerUsernameAndEmailMap[user._id.toString()] = {
            username: user.username,
            email: user.email,
          };
        });

        const notifications: {[key: string]: string} = {};
        Object.keys(fixtureNotifications).forEach(playerId => {
          const playerEmail = playerUsernameAndEmailMap[playerId].email;
          let str = `Hello ${playerUsernameAndEmailMap[playerId].username},<br><br> The tournament <b>${tournamentInfo.name}</b> has started and you have the following fixtures.`;

          fixtureNotifications[playerId].forEach(fixture => {
            str += `<br><br><b>Opponent:</b> ${playerUsernameAndEmailMap[fixture.opponent].username}<br><b>Joining code:</b> ${fixture.joiningCode}`;
          });

          str += '<br><br>Good luck!';

          notifications[playerEmail] = str;
        });

        Object.keys(notifications).forEach(async email => {
          await publish_to_queue(
            'tournament-started-notification',
            {
              email,
              message: notifications[email],
            },
            true
          );
        });

        await session.commitTransaction();

        res.status(200).json({message: 'Tournament started successfully'});
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

export async function fetch_tournament_fixtures(req: Request, res: Response) {
  try {
    const {userId} = req;
    const {tournamentId} = req.params;

    if (!isValidObjectId(tournamentId)) {
      res.status(400).json({message: 'Invalid tournament id'});
      return;
    }

    const tournamentInfo = await TOURNAMENT.findOne({
      creatorId: userId,
      _id: tournamentId,
    });

    if (!tournamentInfo) {
      res.status(404).json({message: 'Tournament not found'});
      return;
    }

    // for each player in the players array fetch thier avatar and username from users
    const pipeline: PipelineStage[] = [
      {
        $match: {
          tournamentId: new ObjectId(tournamentId),
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
