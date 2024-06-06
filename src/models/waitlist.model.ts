import mongoose from 'mongoose';
import {isEmail} from 'validator';

const waitlistSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      validate: [isEmail, 'Please enter a valid email'],
      lowercase: true,
    },
  },
  {timestamps: true}
);

const WAITLIST = mongoose.model('waitlist', waitlistSchema);

export default WAITLIST;
