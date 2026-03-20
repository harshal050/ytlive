const Stream = require("../models/stream.model");
const getYouTube = require("../services/youtube.service");
const startFFmpeg = require("../services/ffmpeg.service");
const cloudinary = require("../config/cloudinary");
const download = require("../utils/download");
const fs = require("fs");
const path = require("path");

const streams = {};

/* ================= WAIT FOR STREAM ACTIVE ================= */

async function waitForStreamActive(youtube, streamId) {
  while (true) {
    const res = await youtube.liveStreams.list({
      part: "status",
      id: streamId,
    });

    const status = res.data.items[0].status.streamStatus;
    console.log("📡 Stream Status:", status);

    if (status === "active") {
      console.log("✅ Stream is ACTIVE");
      break;
    }

    await new Promise((r) => setTimeout(r, 5000));
  }
}

/* ================= CREATE STREAM ================= */

exports.createStream = async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!req.files?.video || !req.files?.audio || !req.files?.thumbnail) {
      return res.status(400).json({ error: "Missing files" });
    }

    /* ===== CLOUDINARY DATA ===== */
    const videoUrl = req.files.video[0].path;
    const audioUrl = req.files.audio[0].path;
    const thumbUrl = req.files.thumbnail[0].path;

    const videoId = req.files.video[0].filename;
    const audioId = req.files.audio[0].filename;
    const thumbId = req.files.thumbnail[0].filename;

    /* ===== TEMP FILES ===== */
    const tempVideo = path.join("temp", `video-${Date.now()}.mp4`);
    const tempAudio = path.join("temp", `audio-${Date.now()}.mp3`);

    console.log("⬇️ Downloading files...");
    await download(videoUrl, tempVideo);
    await download(audioUrl, tempAudio);

    /* ===== YOUTUBE SETUP ===== */
    const youtube = getYouTube();

    /* ===== 1. CREATE STREAM ===== */
    const streamRes = await youtube.liveStreams.insert({
      part: "snippet,cdn",
      requestBody: {
        snippet: { title: title + " Stream" },
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

    console.log("🎥 Stream created");

    /* ===== 2. CREATE BROADCAST ===== */
    const broadcastRes = await youtube.liveBroadcasts.insert({
      part: "snippet,status,contentDetails",
      requestBody: {
        snippet: {
          title,
          description,
          scheduledStartTime: new Date().toISOString(),
        },
        status: {
          privacyStatus: "public",
        },
        contentDetails: {
          enableAutoStart: false,
          enableAutoStop: false,
        },
      },
    });

    const broadcastId = broadcastRes.data.id;

    console.log("📺 Broadcast created:", broadcastId);

    /* ===== 3. BIND ===== */
    await youtube.liveBroadcasts.bind({
      part: "id,contentDetails",
      id: broadcastId,
      streamId: streamId,
    });

    /* ===== DOWNLOAD THUMB ===== */

    console.log("🔗 Stream bound");

    const tempThumb = path.join("temp", `thumb-${Date.now()}.jpg`);
    await download(thumbUrl, tempThumb);

    /* ===== SET THUMBNAIL ===== */
    await youtube.thumbnails.set({
      videoId: broadcastId,
      media: {
        body: fs.createReadStream(tempThumb),
      },
    });

    /* ===== 5. START FFMPEG ===== */
    console.log("🚀 Starting FFmpeg...");

    const ffmpeg = startFFmpeg(
      tempVideo,
      tempAudio,
      `${ingestionAddress}/${streamName}`
    );

    ffmpeg.stderr.on("data", (data) => {
      console.log(`FFmpeg: ${data}`);
    });

    ffmpeg.on("error", (err) => {
      console.error("FFmpeg error:", err.message);
    });

    streams[broadcastId] = {
      process: ffmpeg,
      tempVideo,
      tempAudio,
      videoId,
      audioId,
      thumbId,
    };

    /* ===== 6. WAIT UNTIL ACTIVE ===== */
    await waitForStreamActive(youtube, streamId);
    
    
    // 🔥 EXTRA WAIT (VERY IMPORTANT)
    await new Promise((r) => setTimeout(r, 10000)); 

    /* ===== 7. TRANSITION TO TESTING ===== */

      await youtube.liveBroadcasts.transition({
      part: "status",
      id: broadcastId,
      broadcastStatus: "testing",
    });

    console.log("🧪 TESTING MODE");

    // wait again
    await new Promise((r) => setTimeout(r, 10000));

    /* ===== TO LIVE ===== */
    await youtube.liveBroadcasts.transition({
      part: "status",
      id: broadcastId,
      broadcastStatus: "live",
    });

    console.log("🔥 NOW LIVE");

    /* ===== SAVE DB ===== */
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

  } catch (err) {
    console.error("❌ ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

/* ================= STOP STREAM ================= */

exports.stopStream = async (req, res) => {
  try {
    const { broadcastId } = req.body;

    const s = streams[broadcastId];
    if (!s) return res.status(404).json({ error: "Stream not found" });

    console.log("🛑 Stopping FFmpeg...");
    s.process.kill("SIGINT");

    await new Promise((r) => setTimeout(r, 5000));

    /* ===== DELETE CLOUDINARY ===== */
    console.log("🧹 Deleting Cloudinary files...");

    await cloudinary.uploader.destroy(s.videoId, {
      resource_type: "video",
    });

    await cloudinary.uploader.destroy(s.audioId, {
      resource_type: "video",
    });

    await cloudinary.uploader.destroy(s.thumbId, {
      resource_type: "image",
    });

    /* ===== DELETE TEMP ===== */
    fs.unlinkSync(s.tempVideo);
    fs.unlinkSync(s.tempAudio);

    /* ===== UPDATE DB ===== */
    await Stream.updateOne(
      { broadcastId },
      { status: "stopped" }
    );

    delete streams[broadcastId];

    console.log("✅ Stream stopped");

    res.json({
      message: "🎉 Stream stopped & cleaned",
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

/* ================= MY STREAMS ================= */

exports.myStreams = async (req, res) => {
  const data = await Stream.find({ userId: req.user.id });
  res.json(data);
};