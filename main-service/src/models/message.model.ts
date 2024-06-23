import mongoose from 'mongoose';
export const chatMediaSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: {
        values: ['image', 'video', 'audio', 'file'],
        message: 'Please select a valid media type',
      },
      required: [true, 'Media type is required'],
    },
    url: {
      type: String,
      required: [true, 'Media URL is required'],
    },
    originalExtension: {
      type: String,
      required: [true, 'A file extension is required'],
    },
    originalMimetype: {
      type: String,
      required: [true, 'A file mime type is required'],
    },
    originalFileSize: {
      type: Number,
      required: [true, 'A file size is required'],
    },
  },
  {_id: false}
);

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: [true, 'Please specify a sender ID'],
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: [true, 'Please specify a receiver ID'],
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'message-rooms',
      required: [true, 'Please specify a message room ID'],
    },
    media: {
      type: [chatMediaSchema],
    },
    text: {
      type: String,
      trim: true,
      maxLength: [100000, 'A message can not be more that 100k characters'],
    },
    sent: {
      type: Boolean,
      default: false,
    },
    sentAt: {
      type: Date,
    },
    delivered: {
      type: Boolean,
      default: false,
    },
    deliveredAt: {
      type: Date,
    },
    read: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
  },
  {timestamps: true}
);

// add a pre save to make sure either a media or a text is always present
messageSchema.pre('save', function (next) {
  if (
    (typeof this.text !== 'string' || this.text.length === 0) &&
    (Array.isArray(this.media) === false || this.media.length === 0)
  ) {
    next(new Error('A new message must contain either text or media'));
    return;
  }

  next();
});

const MESSAGE = mongoose.model('message', messageSchema);

export default MESSAGE;
