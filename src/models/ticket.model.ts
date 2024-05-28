import mongoose from 'mongoose';
import {isEmail} from 'validator';

const ticketSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Types.ObjectId,
      ref: 'users',
      required: [true, 'Please specify the user ID'],
    },
    fullName: {
      type: String,
      required: [true, 'Please specify the full name'],
    },
    email: {
      type: String,
      required: [true, 'Please specify the email'],
      validate: [isEmail, 'Please specify a valid email'],
    },
    message: {
      type: String,
      required: [true, 'Please specify the message'],
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'resolved', 'dismissed'],
        message: 'Specify a valid status',
      },
      default: 'pending',
    },
  },
  {timestamps: true}
);

const TICKET = mongoose.model('ticket', ticketSchema);

export default TICKET;
