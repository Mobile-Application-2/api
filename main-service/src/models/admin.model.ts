import mongoose from 'mongoose';
import {isEmail} from 'validator';

const adminSchema = new mongoose.Schema({
  email: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true,
    required: [true, 'Please specify an email'],
    validate: [isEmail, 'Please enter a valid email'],
  },
  password: {
    type: String,
    required: [true, 'Please specify a password'],
    minLength: [8, 'Password must be at least 8 characters long'],
    maxLength: [32, 'Password must be less than 33 characters'],
  },
  walletBalance: {
    type: Number,
    default: 0,
    min: [0, 'Account balance cannot be less than 0'],
  },

  // TODO:
  bankDetails: {},
});

const ADMIN = mongoose.model('admin', adminSchema);

export default ADMIN;
