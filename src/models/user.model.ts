import mongoose from 'mongoose';
import {isEmail, isMobilePhone} from 'validator';
import bcrypt from 'bcrypt';

const notificationPreferencesSchema = new mongoose.Schema(
  {
    pushNotification: {
      type: Boolean,
      default: true,
    },
    email: {
      type: Boolean,
      default: true,
    },
  },
  {_id: false}
);

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      unique: true,
      lowercase: true,
      required: [true, 'Please specify a username'],
      maxLength: [255, 'A username cannot be longer than 255 characters'],
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      required: [true, 'Please specify an email'],
      validate: [isEmail, 'Please enter a valid email'],
    },
    emailIsVerified: {
      type: Boolean,
      default: false,
    },
    dob: {
      type: Date,
      required: [true, 'Please specify a date of birth'],
    },
    password: {
      type: String,
      required: [true, 'Please specify a password'],
      minLength: [8, 'Password must be at least 8 characters long'],
      maxLength: [32, 'Password must be less than 33 characters'],
    },
    phoneNumber: {
      type: String,
      required: [
        true,
        'Please specify a valid phone number in international format',
      ],
      trim: true,
      unique: true,
      validate: {
        validator: (phoneNumber: string) => isMobilePhone(phoneNumber),
        message: 'Please specify a valid phone number in international format',
      },
    },
    phoneNumberIsVerified: {
      type: Boolean,
      default: false,
    },
    bio: {
      type: String,
      maxLength: [10_000, 'Bio cannot be more than 10,000 characters'],
    },
    govermentIDIsVerified: {
      type: Boolean,
      default: false,
    },
    twoFactorAuthenticationEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorAuthenticationProvider: {
      type: String,
      lowercase: true,
      enum: {
        values: ['phone', 'email'],
        message: 'Please select a valid 2FA method', // NOTE: can add auth apps later
      },
    },
    avatar: {
      type: String,
    },
    walletBalance: {
      type: Number,
      default: 0,
      min: [0, 'Account balance cannot be less than 0'],
    },
    notificationPreferences: {
      type: notificationPreferencesSchema,
    },
  },
  {timestamps: true}
);

userSchema.pre('save', async function (next) {
  this.password = await bcrypt.hash(this.password, 10);

  next();
});

const USER = mongoose.model('user', userSchema);

export default USER;
