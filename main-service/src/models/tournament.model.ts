import mongoose from 'mongoose';

// no of participants when trying to start must be greater than number of winners, number of winners must equal prizes array and a prize in the array cannot be 0
// and you need to also account for games that have a minimum of more than 2 players in the log calculation

// const roundSchema = new mongoose.Schema(
//   {
//     label: {
//       type: String,
//       required: [true, 'Please specify the name of this round'],
//     },
//     completed: {
//       type: Boolean,
//       default: false,
//     },
//   },
//   {_id: false}
// );

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
    // currentRound: {
    //   type: String,
    // },
    // allRounds: {
    //   type: [roundSchema],
    //   required: [true, "The rounds array couldn't not be set automatically"],
    // },
  },
  {timestamps: true}
);

const TOURNAMENT = mongoose.model('tournament', tournamentSchema);

// TODO: add a presave to generate the rounds, see if you need to account for number of winners, you might not because say 4 people need to win, then you can simply do top 4, then generate two fixtures the two winners, then the two losers to get 1st, 2nd, 3rd and 4th.
// if 5 winners then you take top 4 and the 5th person you can have a mini tournament among the last 4 where, the losers from round of 8 play again to get the winner who becomes 5th

export default TOURNAMENT;
