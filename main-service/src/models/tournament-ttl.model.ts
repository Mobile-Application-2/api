import mongoose from 'mongoose';
import handle_tournament_ending from '../triggers/handle-tournament-ending';

const tournamentTTLSchema = new mongoose.Schema(
  {
    tournamentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'tournaments',
      required: [true, 'Please specify a tournament ID'],
    },
    expiresAt: {
      type: Date,
      required: [
        true,
        'Please specify a date when this document should expire',
      ],
    },
  },
  {
    timestamps: true,
    collectionOptions: {changeStreamPreAndPostImages: {enabled: true}},
  }
);

tournamentTTLSchema.index({expiresAt: 1}, {expireAfterSeconds: 1}); // 1 second (instantly)

const TOURNAMENTTTL = mongoose.model('tournament-TTL', tournamentTTLSchema);

// create a change stream handler
const deleteEventPipeline: Record<string, unknown>[] = [
  {
    $match: {
      operationType: 'delete',
    },
  },
];

const changeStreamCursor = TOURNAMENTTTL.watch(deleteEventPipeline, {
  fullDocumentBeforeChange: 'whenAvailable',
}).on('change', handle_tournament_ending);

// this is only active during testing
if (process.env.NODE_ENV === 'testing') {
  TOURNAMENTTTL.once('kill-change-stream', async () => {
    await changeStreamCursor.close();
  });
}

export default TOURNAMENTTTL;
