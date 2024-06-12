import mongoose from 'mongoose';

const escrowSchema = new mongoose.Schema(
  {
    lobbyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'lobby',
      required: [true, 'Lobby ID is required'],
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'cancelled'],
      default: 'pending',
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'],
      min: [0, 'Total amount must be at least 0'],
    },
  },
  {timestamps: true}
);

const ESCROW = mongoose.model('escrow', escrowSchema);

export default ESCROW;
