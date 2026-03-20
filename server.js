require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const app = express();

connectDB();

app.use(cors());
app.use(express.json());

app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/stream", require("./routes/stream.routes"));

app.listen(process.env.PORT, () => {
  console.log("🔥 Server running");
});