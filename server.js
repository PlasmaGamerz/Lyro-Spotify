const express = require("express");
const axios = require("axios");
const qs = require("qs");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Fix for Render losing query string
app.set("trust proxy", 1);

// Allow callback query
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Spotify OAuth Server Running ✔️");
});

app.get("/login", (req, res) => {
  if (!req.query.user) return res.send("❌ No user ID provided");

  const scope = [
    "user-read-email",
    "user-read-private",
    "playlist-read-private",
    "playlist-read-collaborative"
  ].join(" ");

  const redirect = `https://accounts.spotify.com/authorize?${qs.stringify({
    response_type: "code",
    client_id: process.env.CLIENT_ID,
    scope,
    redirect_uri: process.env.REDIRECT_URI + `?user=${req.query.user}`,
  })}`;

  return res.redirect(redirect);
});

app.get("/callback", async (req, res) => {
  const code = req.query.code;
  const user = req.query.user;

  if (!code) return res.send("❌ No code provided (Callback broken)");

  try {
    const tokenReq = await axios.post(
      "https://accounts.spotify.com/api/token",
      qs.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.REDIRECT_URI + `?user=${user}`,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const { access_token, refresh_token } = tokenReq.data;

    return res.send(`
      <h1>🎉 Logged in Successfully</h1>
      <p>Tokens received!</p>
      <pre>${JSON.stringify({ access_token, refresh_token }, null, 2)}</pre>
    `);
  } catch (err) {
    console.error(err.response?.data || err);
    return res.send("❌ Error fetching tokens");
  }
});

app.listen(port, () => {
  console.log("Spotify OAuth Server is running on port", port);
});
