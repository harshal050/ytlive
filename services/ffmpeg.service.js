const { spawn } = require("child_process");

module.exports = (video, audio, rtmp) => {
   return spawn("ffmpeg", [
    "-re",

    "-stream_loop", "-1",
    "-i", video,

    "-stream_loop", "-1",
    "-i", audio,

    "-c:v", "libx264",
    "-preset", "veryfast",
    "-pix_fmt", "yuv420p",

    "-g", "60",
    "-r", "30",

    "-c:a", "aac",
    "-b:a", "128k",
    "-ar", "44100",

    "-f", "flv",
    rtmp,
  ]);
};