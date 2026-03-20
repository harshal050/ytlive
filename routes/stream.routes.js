const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const upload = require("../utils/multer");
const ctrl = require("../controllers/stream.controller");

router.post(
  "/create",
  auth,
  upload.fields([
    { name: "video" },
    { name: "audio" },
    { name: "thumbnail" },
  ]),
  ctrl.createStream
);

router.post("/stop", auth, ctrl.stopStream);
router.get("/my", auth, ctrl.myStreams);

module.exports = router;