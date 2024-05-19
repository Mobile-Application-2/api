import mongoose from 'mongoose';

const referralSchema = new mongoose.Schema(
  {
    referrer: {
      type: mongoose.Types.ObjectId,
      ref: 'users',
      required: [true, 'Please specify the referrer ID'],
    },
    referred: {
      type: mongoose.Types.ObjectId,
      ref: 'users',
      required: [true, 'Please specify the referred ID'],
    },
  },
  {timestamps: true}
);

const REFERRAL = mongoose.model('referral', referralSchema);

export default REFERRAL;
