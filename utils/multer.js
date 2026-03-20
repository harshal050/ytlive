const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    let folder = "others";

    if (file.fieldname === "video") folder = "videos";
    if (file.fieldname === "audio") folder = "audios";
    if (file.fieldname === "thumbnail") folder = "thumbnails";

    return {
      folder,
      resource_type: file.fieldname === "thumbnail" ? "image" : "video",
    };
  },
});

module.exports = multer({ storage });