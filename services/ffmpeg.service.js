const { spawn } = require("child_process");

module.exports = (video, audio, rtmp) => {
  return spawn(process.env.FFMPEG_PATH, [
    "-re",
    "-stream_loop", "-1", "-i", video,
    "-stream_loop", "-1", "-i", audio,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-c:a", "aac",
    "-f", "flv",
    rtmp,
  ]);
};