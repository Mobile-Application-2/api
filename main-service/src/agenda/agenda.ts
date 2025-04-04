import dotenv from 'dotenv';

dotenv.config();

import {Agenda, Job} from 'agenda';
import TOURNAMENT from '../models/tournament.model';
import mongoose from 'mongoose';
import generate_tournament_fixtures from '../utils/generate-fixtures';

import crypto from 'crypto';
import TOURNAMENTFIXTURES from '../models/tournament-fixtures.model';
import USER from '../models/user.model';
import {publish_to_queue} from '../utils/rabbitmq';

const DEV_DB_URI = process.env.DEV_DB_URI as string;

const mongoConnectionString = DEV_DB_URI;

const agenda = new Agenda({
  db: {
    address: mongoConnectionString,
  },
});

agenda.define('start_tournament', async (job: Job) => {
  const {tournamentId} = job.attrs.data;

  try {
    await startTournamentLogic(tournamentId);
  } catch (error) {
    console.error('Failed to start tournament:', error);
  }
});

export async function startTournamentLogic(tournamentId: string) {
  try {
    const tournamentInfo = await TOURNAMENT.findById(tournamentId);

    if (!tournamentInfo) throw new Error('Tournament not found');

    if (tournamentInfo.hasStarted) return;

    if (!tournamentInfo.isFullyCreated)
      throw new Error('Tournament is not fully created');

    if (tournamentInfo.endDate < new Date())
      throw new Error('Tournament has already ended');

    if (
      !tournamentInfo.participants.length ||
      tournamentInfo.participants.length % 2 !== 0
    ) {
      throw new Error('Tournament must have an even number of players');
    }

    const session = await mongoose.startSession();

    await session.withTransaction(async session => {
      try {
        await TOURNAMENT.updateOne(
          {_id: tournamentId},
          {$set: {hasStarted: true}},
          {session}
        );

        const fixtures = generate_tournament_fixtures(
          tournamentInfo.participants.map(id => id.toString()),
          tournamentInfo.noOfGamesToPlay
        ).flat();

        const fixtureNotifications: Record<
          string,
          {opponent: string; joiningCode: string; tournamentId: string}[]
        > = {};

        const bulkEntry = fixtures.map(fixture => {
          const joiningCode = crypto
            .createHash('sha256')
            .update(fixture.join(''))
            .digest('base64')
            .slice(0, 6);

          fixture.forEach(player => {
            if (!fixtureNotifications[player])
              fixtureNotifications[player] = [];
            const opponent = fixture.find(p => p !== player);
            fixtureNotifications[player].push({
              tournamentId,
              opponent: opponent as string,
              joiningCode,
            });
          });

          return {tournamentId, joiningCode, players: fixture};
        });

        await TOURNAMENTFIXTURES.create(bulkEntry, {session});

        const playerData = await USER.find(
          {_id: {$in: Object.keys(fixtureNotifications)}},
          {username: 1, email: 1}
        );

        const playerMap = Object.fromEntries(
          playerData.map(user => [
            user._id.toString(),
            {username: user.username, email: user.email},
          ])
        );

        const notifications: Record<string, string> = {};
        Object.keys(fixtureNotifications).forEach(playerId => {
          const playerEmail = playerMap[playerId].email;
          let message = `Hello ${playerMap[playerId].username},<br><br>The tournament <b>${tournamentInfo.name}</b> has started. Your fixtures:<br>`;

          fixtureNotifications[playerId].forEach(({opponent, joiningCode}) => {
            message += `<br><br><b>Opponent:</b> ${playerMap[opponent].username}<br><b>Joining code:</b> ${joiningCode}`;
          });

          message += '<br><br>Good luck!';
          notifications[playerEmail] = message;
        });

        Object.keys(notifications).forEach(async email => {
          await publish_to_queue(
            'tournament-started-notification',
            {email, message: notifications[email]},
            true
          );
        });

        await session.commitTransaction();
      } catch (error) {
        await session.abortTransaction();

        throw error;
      } finally {
        await session.endSession();
      }
    });
  } catch (error) {
    console.log('error when starting tournament', error);
  }
}

export {agenda};
