import {ObjectId} from 'mongoose';

export interface IGameWon {
  lobbyId: ObjectId;
  winnerId: ObjectId;
}
