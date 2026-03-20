const fs = require("fs");
const axios = require("axios");

module.exports = async (url, path) => {
  const res = await axios({ url, method: "GET", responseType: "stream" });

  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(path);
    res.data.pipe(stream);
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
};