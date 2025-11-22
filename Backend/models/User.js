// models/User
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  mobile: { type: String },
  photo: { type: String }, // profile picture URL
});

module.exports = mongoose.model('User', userSchema);
