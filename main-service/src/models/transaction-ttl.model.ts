import mongoose from 'mongoose';
import mark_transaction_as_failed from '../triggers/mark-transaction-as-failed';

const transactionTTLSchema = new mongoose.Schema(
  {
    ref: {
      type: String,
      ref: 'transactions',
      required: [true, 'Please specify a payment ID'],
    },
  },
  {
    timestamps: true,
    collectionOptions: {changeStreamPreAndPostImages: {enabled: true}},
  }
);

transactionTTLSchema.index({createdAt: 1}, {expireAfterSeconds: 60 * 30}); // 30 minutes

const TRANSACTIONTTL = mongoose.model('transaction-TTL', transactionTTLSchema);

// create a change stream handler
const deleteEventPipeline: Record<string, unknown>[] = [
  {
    $match: {
      operationType: 'delete',
    },
  },
];

const changeStreamCursor = TRANSACTIONTTL.watch(deleteEventPipeline, {
  fullDocumentBeforeChange: 'whenAvailable',
}).on('change', mark_transaction_as_failed);

// this is only active during testing
if (process.env.NODE_ENV === 'testing') {
  TRANSACTIONTTL.once('kill-change-stream', async () => {
    await changeStreamCursor.close();
  });
}

export default TRANSACTIONTTL;
