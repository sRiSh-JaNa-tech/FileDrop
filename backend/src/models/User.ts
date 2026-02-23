import mongoose from 'mongoose';

export default new mongoose.Schema({
    userId : Number,
    name : String,
    peerId : String
});