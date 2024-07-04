import mongoose from 'mongoose';

const tournamentEscrowSchema = new mongoose.Schema(
  {
    tournamentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'tournament',
      required: [true, 'Lobby ID is required'],
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'],
      min: [0, 'Total amount must be at least 0'],
    },
    playersThatHavePaid: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },
    // this shows if this escrow is still active or not
    paidOut: {
      type: Boolean,
      default: false,
    },
    isPrize: {
      type: Boolean,
      default: false,
    },
  },
  {timestamps: true}
);

const TOURNAMENTESCROW = mongoose.model(
  'tournament-escrow',
  tournamentEscrowSchema
);

export default TOURNAMENTESCROW;
