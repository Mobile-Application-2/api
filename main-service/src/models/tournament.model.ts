import mongoose from 'mongoose';

const tournamentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name for this tournament'],
      minLength: [3, 'Tournament name must be at least 3 characters long'],
      trim: true,
    },
    gameId: {
      type: mongoose.Types.ObjectId,
      ref: 'games',
      required: [true, 'Please provide a valid game ID for this tournament'],
    },
    creatorId: {
      type: mongoose.Types.ObjectId,
      ref: 'users',
      required: [true, 'Please specify the creator ID for this tournament'],
    },
    registrationDeadline: {
      type: Date,
      required: [
        true,
        'Please provide a registration deadline for this tournament',
      ],
      validate: {
        validator: (date: Date) => Date.now() < new Date(date).getTime(),
        message: 'Please specify a deadline date in the future',
      },
    },
    noOfWinners: {
      type: Number,
      min: [0, 'There must be at least 1 winner'],
      required: [
        true,
        'Please provide the number of winners for this tournment',
      ],
      validate: {
        validator: (noOfWinners: number) => Number.isInteger(noOfWinners),
        message: 'Please provide a valid number of winners (whole number)',
      },
    },
    hasGateFee: {
      type: Boolean,
      required: [
        true,
        'Please indicate if this tournament should have a gate fee or not',
      ],
    },
    gateFee: {
      type: Number,
      validate: {
        validator: (fee: number) => Number.isInteger(fee),
        message: 'Please provide a valid fee (whole number)',
      },
    },
    prizes: {
      type: [Number],
    },
    joiningCode: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    hasStarted: {
      type: Boolean,
      default: false,
    },
    isFullyCreated: {
      type: Boolean,
      default: false,
    },
    participants: {
      type: [mongoose.Types.ObjectId],
      default: [],
    },
    winners: {
      type: [mongoose.Types.ObjectId],
      default: [],
    },
    endDate: {
      type: Date,
      required: [true, 'Please provide an end date for this tournament'],
      validate: {
        validator: (date: Date) => Date.now() < new Date(date).getTime(),
        message: 'Please specify a deadline date in the future',
      },
    },
    noOfGamesToPlay: {
      type: Number,
      required: [
        true,
        'Please provide the number of games to play for this tournament',
      ],
    },
  },
  {timestamps: true}
);

const TOURNAMENT = mongoose.model('tournament', tournamentSchema);

export default TOURNAMENT;
