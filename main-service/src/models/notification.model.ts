import mongoose from 'mongoose';

// JOSHUA
// FOR THE MESSAGING SYSTEM AS A REQUEST FROM THE MOBILE DEV
const chatNotificationExtra = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.ObjectId,
    required: [true, 'A user ID is required'],
    ref: 'users',
  },
  avatar: {
    type: String,
  },
  isCelebrity: {
    type: Boolean,
    default: false,
  },
  firstName: {
    type: String,
  },
  lastName: {
    type: String,
  },
  bio: {
    type: String,
    maxLength: [10_000, 'Bio cannot be more than 10,000 characters'],
  },
  username: {
    type: String,
    unique: true,
    lowercase: true,
    minLength: [3, 'A username must be at least 3 characters long'],
    required: [true, 'Please specify a username'],
    maxLength: [255, 'A username cannot be longer than 255 characters'],
    trim: true,
  },
})

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.ObjectId,
      required: [true, 'A user ID is required'],
      ref: 'users',
    },
    image: {
      type: String,
      required: [true, 'An image is required'],
    },
    title: {
      type: String,
      required: [true, 'A title is required'],
    },
    body: {
      type: String,
      required: [true, 'A body is required'],
    },
    read: {
      type: Boolean,
      default: false,
    },
    senderInformation: chatNotificationExtra,
  },
  { timestamps: true }
);

const NOTIFICATION = mongoose.model('notification', notificationSchema);

export default NOTIFICATION;
