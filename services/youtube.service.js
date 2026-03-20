const { google } = require("googleapis");

module.exports = () => {
  const auth = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.REDIRECT_URI
  );

  auth.setCredentials({
    refresh_token: process.env.REFRESH_TOKEN,
  });

  return google.youtube({ version: "v3", auth });
};