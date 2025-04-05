import mongoose from 'mongoose';

const activeSchema = new mongoose.Schema(
  {
    userID: {
      type: String,
      required: [true, 'Please specify a user id'],
      maxLength: [255, 'A username cannot be longer than 255 characters'],
    },
    socketID: {
      type: String,
      required: [true, 'Please specify a socket id'],
      maxLength: [255, 'A username cannot be longer than 255 characters'],
    },
  },
  {timestamps: true}
);

const ACTIVEUSER = mongoose.model('active-user', activeSchema);

export default ACTIVEUSER;
