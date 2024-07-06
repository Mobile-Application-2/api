import mongoose from 'mongoose';

const gameSchema = new mongoose.Schema(
  {
    image: {
      type: String,
      required: [true, 'Image is required'],
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    averageRating: {
      type: Number,
      default: 0,
      min: [0, 'Average rating must be at least 0'],
      max: [5, 'Average rating must be at most 5'],
    },
    maxPlayers: {
      type: Number,
      required: [true, 'Max players is required'],
      min: [2, 'Max players must be at least 2'],
    },
  },
  {timestamps: true}
);

const GAME = mongoose.model('game', gameSchema);

export default GAME;
