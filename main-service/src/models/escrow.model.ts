import mongoose from 'mongoose';

const escrowSchema = new mongoose.Schema(
  {
    lobbyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'lobby',
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
  },
  {timestamps: true}
);

const ESCROW = mongoose.model('escrow', escrowSchema);

export default ESCROW;
