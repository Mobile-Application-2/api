import mongoose from 'mongoose';

const ErrorSchema = new mongoose.Schema({
    error: {
        type: String,
    }
}, {
    collection: "errors"
});

const ErrorModel = mongoose.model('error', ErrorSchema);

export default ErrorModel;
