import amqplib from 'amqplib';
import * as Sentry from '@sentry/node';
import mongoose, {isValidObjectId} from 'mongoose';
import LOBBY from '../models/lobby.model';
import USER from '../models/user.model';
import {IGameWon} from '../interfaces/queue';
import ESCROW from '../models/escrow.model';
import TRANSACTION from '../models/transaction.model';
import {v4 as uuidV4} from 'uuid';
import IStartTournamentNotification from '../interfaces/start-tournament-notification';
import send_mail from '../utils/nodemailer';
import NOTIFICATION from '../models/notification.model';

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

      const lastestEscrowInfo = await ESCROW.findOne(
        {lobbyId},
        {},
        {sort: {createdAt: -1}}
      );

      if (lastestEscrowInfo === null) {
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

      if (lastestEscrowInfo.paidOut) {
        Sentry.addBreadcrumb({
          category: 'game',
          data: {
            lobbyId,
          },
          message: 'Winner reported twice',
        });

        Sentry.captureMessage('A winner was reported twice', 'warning');
        channel.ack(message);
        return;
      }

      // ensure the game confirms an escrow payment has been made and a new round was started before crediting winner
      // i.e number of escrows === noOfGamesPlayed
      const escrowCount = await ESCROW.countDocuments({lobbyId});

      if (escrowCount === 0 || escrowCount !== lobbyInfo.noOfGamesPlayed) {
        Sentry.addBreadcrumb({
          category: 'game',
          data: {
            lobbyId,
            escrowCount,
            noOfGamesPlayed: lobbyInfo.noOfGamesPlayed,
          },
          message:
            'Attempted to report a winner when there was a discrepancy between the escrowCount and noOfGamesPlayed',
        });

        Sentry.captureMessage(
          'Attempted to report a winner when there was a discrepancy between the escrowCount and noOfGamesPlayed',
          'warning'
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
            {$inc: {walletBalance: lastestEscrowInfo.totalAmount}},
            {session}
          );

          // create new transactions
          await TRANSACTION.create(
            [
              {
                amount: lastestEscrowInfo.totalAmount,
                description: 'Earnings from game',
                fee: 0,
                ref: uuidV4(),
                status: 'completed',
                total: lastestEscrowInfo.totalAmount,
                type: 'deposit',
                userId: winnerId,
              },
            ],
            {session}
          );

          await LOBBY.updateOne(
            {_id: lobbyId},
            {$push: {winners: winnerId}},
            {session}
          );

          // mark escrow as paid
          await ESCROW.updateOne(
            {_id: lastestEscrowInfo._id},
            {$set: {paidOut: true}},
            {session}
          );

          // send the winner a notification
          await NOTIFICATION.create(
            [
              {
                userId: winnerId,
                title: '🥳🥳 You won!!! 🥳🥳',
                body: 'Good job, you won your game and your earnings have been credited to your account',
                image: process.env.SKYBOARD_LOGO as string,
              },
            ],
            {session}
          );

          await send_mail(userInfo.email, 'game-won', 'You won a game', {
            username: userInfo.username,
            lobbyCode: lobbyInfo.code,
            amount: `${(lastestEscrowInfo.totalAmount / 100).toFixed(2)} naira`,
          });

          // TODO: push notification later
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

export async function send_tournament_start_notification(
  message: amqplib.ConsumeMessage | null,
  channel: amqplib.Channel
) {
  try {
    if (message) {
      const {email, message: emailContent} = JSON.parse(
        message.content.toString()
      ) as IStartTournamentNotification;

      // send email to user
      await send_mail(email, 'tournament-started', 'Your Fixture List', {
        emailContent,
      });

      channel.ack(message);
    }
  } catch (error) {
    Sentry.captureException(error, {
      level: 'error',
      tags: {source: 'send_tournament_start_notification function'},
    });

    if (message) channel.ack(message);
  }
}
