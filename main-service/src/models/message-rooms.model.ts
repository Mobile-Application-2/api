import mongoose from 'mongoose';

const messageRoomsSchema = new mongoose.Schema(
  {
    participants: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'users',
      required: [true, 'Please specify the participants for this chat room'],
      validate: {
        validator: function (value: any) {
          return value.length >= 2;
        },
        message: 'There must be at least 2 users in a conversation',
      },
    },
    // might need other fields here like for shared preference etc.
  },
  {timestamps: true}
);

const MESSAGEROOMS = mongoose.model('message-room', messageRoomsSchema);

export default MESSAGEROOMS;
