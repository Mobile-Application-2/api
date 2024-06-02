import mongoose from 'mongoose';

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
  },
  {timestamps: true}
);

const NOTIFICATION = mongoose.model('notification', notificationSchema);

export default NOTIFICATION;
