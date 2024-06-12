import mongoose from 'mongoose';

const lobbySchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Code is required'],
      unique: true,
    },
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      required: [true, 'Creator ID is required'],
    },
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'game',
      required: [true, 'Game ID is required'],
    },
    wagerAmount: {
      type: Number,
      required: [true, 'Wager amount is required'],
      min: [0, 'Wager amount must be at least 0'],
    },
    participants: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'user',
    },
    // might need a new collection for this
    winners: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'user',
    },
    noOfGamesPlayed: {
      type: Number,
      default: 0,
      min: [0, 'Number of games played must be at least 0'],
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {timestamps: true}
);

const LOBBY = mongoose.model('lobby', lobbySchema);

export default LOBBY;
