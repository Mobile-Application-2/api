import amqplib from 'amqplib';
import * as Sentry from '@sentry/node';
import mongoose, {isValidObjectId} from 'mongoose';
import LOBBY from '../models/lobby.model';
import USER from '../models/user.model';
import {IGameWon} from '../interfaces/queue';
import ESCROW from '../models/escrow.model';

export async function handle_game_started(
  message: amqplib.ConsumeMessage | null,
  channel: amqplib.Channel
) {
  try {
    if (message) {
      // parse message and process
      const lobbyId = message.content.toString();

      if (!isValidObjectId(lobbyId)) {
        Sentry.addBreadcrumb({
          category: 'game',
          data: {
            lobbyId,
          },
          message: 'Invalid lobbyId provided',
        });

        Sentry.captureMessage(
          'A handle game started message came in with an invalid lobbyId',
          'warning'
        );

        channel.ack(message);
        return;
      }

      const lobbyInfo = await LOBBY.findOne({_id: lobbyId});

      if (lobbyInfo === null) {
        Sentry.addBreadcrumb({
          category: 'game',
          data: {
            lobbyId,
          },
          message: 'Invalid lobbyId provided',
        });

        Sentry.captureMessage(
          'A handle game started message came in with an invalid lobbyId',
          'warning'
        );

        channel.ack(message);
        return;
      }

      await LOBBY.updateOne({_id: lobbyId}, {$inc: {noOfGamesPlayed: 1}});
      channel.ack(message);
    }
  } catch (error) {
    Sentry.captureException(error, {
      level: 'error',
      tags: {source: 'handle_game_info function'},
    });

    if (message) channel.ack(message);
  }
}

export async function handle_game_won(
  message: amqplib.ConsumeMessage | null,
  channel: amqplib.Channel
) {
  try {
    if (message) {
      const {lobbyId, winnerId} = JSON.parse(
        message.content.toString()
      ) as IGameWon;

      if (!isValidObjectId(lobbyId) || !isValidObjectId(winnerId)) {
        Sentry.addBreadcrumb({
          category: 'game',
          data: {
            lobbyId,
            winnerId,
          },
          message: 'Invalid lobbyId or winnerId provided',
        });

        Sentry.captureMessage(
          'A handle game won message came in with an invalid lobbyId or winnerId',
          'warning'
        );

        channel.ack(message);
        return;
      }

      const lobbyInfo = await LOBBY.findOne({_id: lobbyId});
      const userInfo = await USER.findOne({_id: winnerId});

      if (userInfo === null || lobbyInfo === null) {
        Sentry.addBreadcrumb({
          category: 'game',
          data: {
            lobbyId,
            winnerId,
          },
          message: 'Invalid lobbyId or winnerId provided',
        });

        Sentry.captureMessage(
          'A handle game won message came in with an invalid lobbyId or winnerId',
          'warning'
        );

        channel.ack(message);
        return;
      }

      const escrowInfo = await ESCROW.findOne({lobbyId});

      if (escrowInfo === null) {
        Sentry.addBreadcrumb({
          category: 'game',
          data: {
            lobbyId,
          },
          message: 'Invalid lobbyId provided',
        });

        Sentry.captureMessage(
          "A handle game won message came in with a lobbyId that doesn't match any escrow document so payment could not be processed",
          'error'
        );

        channel.ack(message);
        return;
      }

      const session = await mongoose.startSession({
        defaultTransactionOptions: {
          writeConcern: {w: 'majority'},
          readConcern: 'majority',
        },
      });

      await session.withTransaction(async session => {
        try {
          // update the winner with the amount from the escrow
          await USER.updateOne(
            {_id: winnerId},
            {$inc: {walletBalance: escrowInfo.totalAmount}},
            {session}
          );

          await LOBBY.updateOne(
            {_id: lobbyId},
            {$push: {winners: winnerId}},
            {session}
          );

          await session.commitTransaction();
          channel.ack(message);
        } catch (error) {
          await session.abortTransaction();

          throw error;
        } finally {
          await session.endSession();
        }
      });
    }
  } catch (error) {
    Sentry.captureException(error, {
      level: 'error',
      tags: {source: 'handle_game_won function'},
    });

    if (message) channel.ack(message);
  }
}
