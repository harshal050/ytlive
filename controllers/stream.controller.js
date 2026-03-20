const Stream = require("../models/stream.model");
const getYouTube = require("../services/youtube.service");
const startFFmpeg = require("../services/ffmpeg.service");
const cloudinary = require("../config/cloudinary");
const download = require("../utils/download");
const path = require("path");
const fs = require("fs");

const streams = {};

exports.createStream = async (req, res) => {
  try {
    const { title, description } = req.body;

    const videoUrl = req.files.video[0].path;
    const audioUrl = req.files.audio[0].path;
    const thumbUrl = req.files.thumbnail[0].path;

    const videoId = req.files.video[0].filename;
    const audioId = req.files.audio[0].filename;
    const thumbId = req.files.thumbnail[0].filename;

    const tempVideo = `temp/video-${Date.now()}.mp4`;
    const tempAudio = `temp/audio-${Date.now()}.mp3`;

    await download(videoUrl, tempVideo);
    await download(audioUrl, tempAudio);

    const youtube = getYouTube();

    const streamRes = await youtube.liveStreams.insert({
      part: "snippet,cdn",
      requestBody: {
        snippet: { title },
        cdn: {
          ingestionType: "rtmp",
          resolution: "720p",
          frameRate: "30fps",
        },
      },
    });

    const streamId = streamRes.data.id;
    const { streamName, ingestionAddress } =
      streamRes.data.cdn.ingestionInfo;

    const broadcastRes = await youtube.liveBroadcasts.insert({
      part: "snippet,status",
      requestBody: {
        snippet: {
          title,
          description,
          scheduledStartTime: new Date(),
        },
        status: { privacyStatus: "public" },
      },
    });

    const broadcastId = broadcastRes.data.id;

    await youtube.liveBroadcasts.bind({
      id: broadcastId,
      part: "id,contentDetails",
      streamId,
    });

    const ffmpeg = startFFmpeg(
      tempVideo,
      tempAudio,
      `${ingestionAddress}/${streamName}`
    );

    streams[broadcastId] = {
      process: ffmpeg,
      tempVideo,
      tempAudio,
      videoId,
      audioId,
      thumbId,
    };

    await Stream.create({
      userId: req.user.id,
      title,
      description,
      broadcastId,
      status: "live",
      videoId,
      audioId,
      thumbnailId: thumbId,
    });

    res.json({
      message: "🚀 LIVE",
      url: `https://youtube.com/watch?v=${broadcastId}`,
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.stopStream = async (req, res) => {
  const { broadcastId } = req.body;

  const s = streams[broadcastId];
  if (!s) return res.send("Not found");

  s.process.kill("SIGINT");

  await cloudinary.uploader.destroy(s.videoId, { resource_type: "video" });
  await cloudinary.uploader.destroy(s.audioId, { resource_type: "video" });
  await cloudinary.uploader.destroy(s.thumbId, { resource_type: "image" });

  fs.unlinkSync(s.tempVideo);
  fs.unlinkSync(s.tempAudio);

  await Stream.updateOne(
    { broadcastId },
    { status: "stopped" }
  );

  delete streams[broadcastId];

  res.json({ message: "Stopped & cleaned" });
};

exports.myStreams = async (req, res) => {
  const data = await Stream.find({ userId: req.user.id });
  res.json(data);
};