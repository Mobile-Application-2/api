import * as Sentry from '@sentry/node';

import { agenda } from "./agenda";
import LOBBY from '../models/lobby.model';
import mongoose from 'mongoose';
import ESCROW from '../models/escrow.model';
import USER from '../models/user.model';
import TRANSACTION from '../models/transaction.model';
import { v4 as uuidV4 } from 'uuid';
import NOTIFICATION from '../models/notification.model';

export async function scheduleIdleLobbyCheck(lobbyId: string) {
    try {
        await agenda.schedule("10 minutes", "idle-lobby-check", {
            lobbyId: lobbyId
        })

        console.log("done scheduling idle lobby check");
    }
    catch (error) {
        console.error("Error scheduling idle lobby check");

        Sentry.captureException(error);
    }
}

export async function idleLobbyCheckJob(lobbyId: string) {
    try {
        const lobby = await LOBBY.findById(lobbyId);

        if (!lobby) {
            console.warn("lobby not found for idle lobby check");

            return;
        }

        if (lobby.participants.length > 1) {
            console.log("nothing to do in idle check, okay");

            return;
        }

        // REFUND
        await handle_game_refund(lobbyId);

        console.log("refund successful");
    }
    catch (error) {
        console.error("Error running idle lobby check");

        Sentry.captureException(error);
    }
}

export async function handle_game_refund(lobbyId: string) {
    try {
        const lastestEscrowInfo = await ESCROW.findOne(
            { lobbyId },
            {},
            { sort: { createdAt: -1 } }
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
                "A handle game timed out message came in with a lobbyId that doesn't match any escrow document so refund could not be processed",
                'error'
            );

            return;
        }

        const session = await mongoose.startSession({
            defaultTransactionOptions: {
                writeConcern: { w: 'majority' },
                readConcern: 'majority',
            },
        });

        const paidPlayersToRefund = lastestEscrowInfo.playersThatHavePaid;

        if (!paidPlayersToRefund.length) {
            console.log("no players to refund");

            Sentry.captureMessage('No players to refund in timed out lobby', 'info');

            return;
        }

        await session.withTransaction(async session => {
            try {
                const amountToRefund = lastestEscrowInfo.totalAmount;

                await USER.updateMany(
                    { _id: { $in: paidPlayersToRefund } },
                    { $inc: { walletBalance: amountToRefund } },
                    { session }
                );

                const transactions = paidPlayersToRefund.map(playerId => ({
                    amount: amountToRefund,
                    description: 'Refund from game',
                    fee: 0,
                    ref: uuidV4(),
                    status: 'completed',
                    total: amountToRefund,
                    type: 'deposit',
                    userId: playerId,
                }));

                await TRANSACTION.insertMany(transactions, { session });

                await LOBBY.updateOne(
                    { _id: lobbyId },
                    { $set: { active: false, dead: true } },
                    { session }
                );

                // mark escrow as paid
                await ESCROW.updateOne(
                    { _id: lastestEscrowInfo._id },
                    { $set: { refunded: true } },
                    { session }
                );

                const notificationsToSend = paidPlayersToRefund.map(playerId => ({
                    userId: playerId,
                    title: 'Refund Processing',
                    body: 'A refund is currently being processed due to a lobby timing out',
                    image: process.env.SKYBOARD_LOGO as string
                }))

                await NOTIFICATION.insertMany(notificationsToSend, { session });

                /* await send_mail(userInfo.email, 'game-won', 'You won a game', {
                  username: userInfo.username,
                  lobbyCode: lobbyInfo.code,
                  amount: `${(winnerShare / 100).toFixed(2)} naira`,
                }); */

                // TODO: push notification later
                await session.commitTransaction();

            } catch (error) {
                await session.abortTransaction();

                throw error;
            } finally {
                await session.endSession();
            }
        });
    }
    catch (error) {
        Sentry.captureException(error, {
            level: 'error',
            tags: { source: 'handle_game_refund function' },
        });

        throw error;
    }
}