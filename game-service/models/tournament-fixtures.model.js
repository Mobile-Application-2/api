import mongoose from 'mongoose';

const tournamentFixturesSchema = new mongoose.Schema(
  {
    tournamentId: {
      type: mongoose.Types.ObjectId,
      required: [true, 'Please provide a tournament ID'],
      ref: 'tournaments',
    },
    players: {
      type: [mongoose.Types.ObjectId],
      required: [true, 'Please provide a list of players'],
    },
    winner: {
      type: mongoose.Types.ObjectId,
    },
    joiningCode: {
      type: String,
      required: [true, 'Please provide a joining code for this fixture'],
    },
    gameStarted: {
      type: Boolean,
      default: false,
    },
  },
  {timestamps: true}
);

const TOURNAMENTFIXTURES = mongoose.model(
  'tournament-fixtures',
  tournamentFixturesSchema
);

export default TOURNAMENTFIXTURES;
