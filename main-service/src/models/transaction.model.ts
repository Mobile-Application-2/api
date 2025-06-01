import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    ref: {
      type: String,
      required: [true, 'Please specify a reference for this transaction'],
      unique: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      required: [true, 'Please specify the user ID'],
    },
    amount: {
      type: Number,
      required: [true, 'An amount is required'],
      min: [0, 'Amount cannot be negative'],
    },
    fee: {
      type: Number,
      required: [true, 'A fee is required'],
      min: [0, 'Fee cannot be negative'],
    },
    total: {
      type: Number,
      required: [true, 'A total is required'],
      min: [0, 'Total cannot be negative'],
      validate: {
        validator: function (this: {
          amount: number;
          fee: number;
          total: number;
        }) {
          return this.total === this.amount + this.fee;
        },
        message: 'Total must be equal to the sum of amount and fee',
      },
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
    },
    manual: {
      type: Boolean
    }
  },
  { timestamps: true }
);

const TRANSACTION = mongoose.model('transaction', transactionSchema);

export default TRANSACTION;
