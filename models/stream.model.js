const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  title: String,
  description: String,
  broadcastId: String,
  status: String,
  videoId: String,
  audioId: String,
  thumbnailId: String,
}, { timestamps: true });

module.exports = mongoose.model("Stream", schema);