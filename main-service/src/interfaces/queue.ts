import mongoose from 'mongoose';

export interface IGameWon {
  lobbyId: mongoose.Types.ObjectId;
  winnerId: mongoose.Types.ObjectId;
}
