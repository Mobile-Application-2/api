import mongoose from 'mongoose';

const adminTransactionSchema = new mongoose.Schema(
  {
    ref: {
      type: String,
      required: [true, 'Please specify a reference for this transaction'],
      unique: true,
    },
    amount: {
      type: Number,
      required: [true, 'An amount is required'],
      min: [0, 'Amount cannot be negative'],
    },
    type: {
      type: String,
      enum: {
        values: ['deposit', 'withdrawal'],
        message: 'Invalid transaction type',
      },
      required: [true, 'Please specify the transaction type'],
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'completed', 'failed'],
        message: 'Invalid status for transaction',
      },
      default: 'pending',
    },
    description: {
      type: String,
      required: [true, 'All admin transactions must have a description'],
    },
  },
  {timestamps: true}
);

const ADMINTRANSACTION = mongoose.model(
  'admin-transaction',
  adminTransactionSchema
);

export default ADMINTRANSACTION;
