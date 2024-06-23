import mongoose from 'mongoose';

const gameRatingSchema = new mongoose.Schema(
  {
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'game',
      required: [true, 'Game ID is required'],
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      required: [true, 'User ID is required'],
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating must be at most 5'],
    },
  },
  {timestamps: true}
);

const GAMERATING = mongoose.model('game-rating', gameRatingSchema);

export default GAMERATING;
