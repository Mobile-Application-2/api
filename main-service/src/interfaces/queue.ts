import mongoose from 'mongoose';

export interface IGameWon {
  lobbyId: mongoose.Types.ObjectId;
  winnerId: mongoose.Types.ObjectId;
}

export interface IStartTournamentNotification {
  email: string;
  message: string;
}

export interface ITournamentFixtureWon {
  fixtureId: mongoose.Types.ObjectId;
  winnerId: mongoose.Types.ObjectId;
}
