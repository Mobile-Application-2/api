import * as Sentry from '@sentry/node';
import TOURNAMENT from '../models/tournament.model';
import mongoose, {PipelineStage} from 'mongoose';
import USER from '../models/user.model';
import TRANSACTION from '../models/transaction.model';
import {v4 as uuidV4} from 'uuid';
import TOURNAMENTESCROW from '../models/tournament-escrow.model';
import TOURNAMENTFIXTURES from '../models/tournament-fixtures.model';

export default async function handle_tournament_ending(changeData: any) {
  // check that the 'fullDocumentBeforeChange' exists
  if (
    Object.prototype.hasOwnProperty.call(
      changeData,
      'fullDocumentBeforeChange'
    ) === false
  ) {
    Sentry.captureMessage(
      "A handle_tournament_ending trigger came in that didn't contain a fullDocumentBeforeChange object",
      'warning'
    );
    return;
  }

  const {fullDocumentBeforeChange} = changeData;

  const tournamentInfo = await TOURNAMENT.findOne({
    _id: fullDocumentBeforeChange.tournamentId,
  });

  if (!tournamentInfo) {
    Sentry.addBreadcrumb({
      category: 'tournament',
      message: 'Tournament not found',
      data: fullDocumentBeforeChange,
    });

    Sentry.captureMessage(
      'A handle_tournament_ending trigger came in for a tournament that does not exist',
      'warning'
    );
    return;
  }

  // check if this has already been handled
  const escrows = await TOURNAMENTESCROW.find({
    tournamentId: tournamentInfo._id,
  });

  if (escrows.every(x => x.paidOut)) {
    Sentry.addBreadcrumb({
      category: 'tournament',
      message: 'Tournament already handled',
      data: tournamentInfo,
    });

    Sentry.captureMessage(
      'A handle_tournament_ending trigger came in for a tournament that has already been handled',
      'warning'
    );
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
      // check if the tournament actually started, if it didn't refund all the players the gatefee
      // (if applicable tournamentEscrow total pay / players who paid) and the creator the prizepool
      if (!tournamentInfo.hasStarted) {
        // refund players if people joined
        if (tournamentInfo.hasGateFee && tournamentInfo.participants.length) {
          // get the escrow for gateFees
          const escrowInfo = await TOURNAMENTESCROW.findOne({
            tournamentId: tournamentInfo._id,
            isPrize: false,
          });

          if (!escrowInfo) {
            Sentry.addBreadcrumb({
              category: 'tournament',
              message: 'Tournament escrow (gate fees) not found',
              data: tournamentInfo,
            });

            Sentry.captureMessage(
              'A handle_tournament_ending trigger came in for a tournament that does not have an escrow for gate fees',
              'warning'
            );
            return;
          }

          const amountToRefund =
            escrowInfo.totalAmount / escrowInfo.playersThatHavePaid.length;

          await USER.updateMany(
            {_id: {$in: escrowInfo.playersThatHavePaid}},
            {$inc: {walletBalance: amountToRefund}},
            {session}
          );

          // create new transactions
          await TRANSACTION.create(
            escrowInfo.playersThatHavePaid.map(x => ({
              amount: amountToRefund,
              description: 'Refund for tournament gate fee',
              fee: 0,
              ref: uuidV4(),
              status: 'completed',
              total: amountToRefund,
              type: 'deposit',
              userId: x._id,
            })),
            {session}
          );

          await TOURNAMENTESCROW.updateOne(
            {tournamentId: tournamentInfo._id, isPrize: false},
            {$set: {paidOut: true}},
            {session}
          );
        }

        // refund creator if the creator has set the prizepool
        if (tournamentInfo.prizes.length) {
          const totalToRefund = tournamentInfo.prizes.reduce(
            (acc: number, prize: number) => acc + prize,
            0
          );

          // update wallet, add transaction, update the escrow to indicate paidOut
          await USER.updateOne(
            {_id: tournamentInfo.creatorId},
            {
              $inc: {walletBalance: totalToRefund},
            },
            {session}
          );

          await TRANSACTION.create(
            [
              {
                amount: totalToRefund,
                description: 'Refund for tournament prizes',
                fee: 0,
                ref: uuidV4(),
                status: 'completed',
                total: totalToRefund,
                type: 'deposit',
                userId: tournamentInfo.creatorId,
              },
            ],
            {session}
          );

          await TOURNAMENTESCROW.updateOne(
            {tournamentId: tournamentInfo._id, isPrize: true},
            {$set: {paidOut: true}},
            {session}
          );
        }
      } else {
        // if multiple people have same win, the tie will be determined based on who got the final win first
        const winnersPipeline: PipelineStage[] = [
          {
            $group: {
              _id: '$winner',
              totalWins: {$sum: 1},
              lastWin: {$max: '$updatedAt'},
            },
          },
          {
            $sort: {
              totalWins: -1,
              lastWin: 1,
            },
          },
          {
            $limit: tournamentInfo.noOfWinners,
          },
        ];

        const winners = await TOURNAMENTFIXTURES.aggregate(winnersPipeline);

        // add winners to the winners array
        await TOURNAMENT.updateOne(
          {_id: tournamentInfo._id},
          {$set: {winners: winners.map(x => x._id), hasEnded: true}},
          {session}
        );

        // pay the winners
        for (let i = 0; i < winners.length; i++) {
          const winner = winners[i];

          const prize = tournamentInfo.prizes[i];

          await USER.updateOne(
            {_id: winner._id},
            {$inc: {walletBalance: prize}},
            {session}
          );

          await TRANSACTION.create(
            [
              {
                amount: prize,
                description: 'Tournament prize',
                fee: 0,
                ref: uuidV4(),
                status: 'completed',
                total: prize,
                type: 'deposit',
                userId: winner._id,
              },
            ],
            {session}
          );
        }

        // mark the prize escrow as paid
        await TOURNAMENTESCROW.updateOne(
          {tournamentId: tournamentInfo._id, isPrize: true},
          {$set: {paidOut: true}},
          {session}
        );

        // pay the celebrity
        // get the escrow for gateFees
        const escrowInfo = await TOURNAMENTESCROW.findOne({
          tournamentId: tournamentInfo._id,
          isPrize: false,
        });

        if (!escrowInfo) {
          Sentry.addBreadcrumb({
            category: 'tournament',
            message: 'Tournament escrow (gate fees) not found',
            data: tournamentInfo,
          });

          Sentry.captureMessage(
            'A handle_tournament_ending trigger came in for a tournament that does not have an escrow for gate fees',
            'warning'
          );
          return;
        }

        await USER.updateOne(
          {_id: tournamentInfo.creatorId},
          {$inc: {walletBalance: escrowInfo.totalAmount}},
          {session}
        );

        await TRANSACTION.create(
          [
            {
              amount: escrowInfo.totalAmount,
              description: 'Tournament gate fee(s)',
              fee: 0,
              ref: uuidV4(),
              status: 'completed',
              total: escrowInfo.totalAmount,
              type: 'deposit',
              userId: tournamentInfo.creatorId,
            },
          ],
          {session}
        );

        // mark the gate fee escrow as paid
        await TOURNAMENTESCROW.updateOne(
          {tournamentId: tournamentInfo._id, isPrize: false},
          {$set: {paidOut: true}},
          {session}
        );

        // check if there are less players than prizes
        if (winners.length < tournamentInfo.noOfWinners) {
          const remainingPrizes = tournamentInfo.prizes.slice(winners.length);

          const totalRemainingPrizes = remainingPrizes.reduce(
            (acc: number, prize: number) => acc + prize,
            0
          );

          // refund the remaining prizes to the celebrity
          await USER.updateOne(
            {_id: tournamentInfo.creatorId},
            {$inc: {walletBalance: totalRemainingPrizes}},
            {session}
          );

          await TRANSACTION.create(
            [
              {
                amount: totalRemainingPrizes,
                description: 'Remaining tournament prizes refund',
                fee: 0,
                ref: uuidV4(),
                status: 'completed',
                total: totalRemainingPrizes,
                type: 'deposit',
                userId: tournamentInfo.creatorId,
              },
            ],
            {session}
          );
        }
      }

      // the logic for handling the end of a tournament (when the game hasn't started is straightforward)
      // if the tournament did start, then process the people with most wins and add to winners array paying them the prizepool
      // once the winners are paid, pay the celeb the total gatefee he/she earned from the tournament escrow document.
      // if there are less players than prizes refund the celebrity when the tournament ends the remaining prizes
      // TODO: inform the celeb of thier earning and tournament ending same as the users as well

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();

      Sentry.captureException(error);
    } finally {
      await session.endSession();
    }
  });
}
