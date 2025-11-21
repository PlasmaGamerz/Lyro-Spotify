const express = require("express");
const axios = require("axios");
const qs = require("qs");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const TOKEN_DIR = path.join(__dirname, "public", "tokens");
if (!fs.existsSync(TOKEN_DIR)) fs.mkdirSync(TOKEN_DIR, { recursive: true });

/* ============================================================
   HOME
===============================================================*/
app.get("/", (req, res) => {
  res.send("Lyro Spotify OAuth Server Running ✔️");
});

/* ============================================================
   LOGIN  (NO QUERY PARAM IN REDIRECT_URI)
===============================================================*/
app.get("/login", (req, res) => {
  const userId = req.query.user;
  if (!userId) return res.send("❌ No user ID provided");

  const scope = [
    "user-read-email",
    "user-read-private",
    "playlist-read-private",
    "playlist-read-collaborative"
  ].join(" ");

  // 👇 state carries userId safely
  const authUrl = `https://accounts.spotify.com/authorize?${qs.stringify({
    response_type: "code",
    client_id: process.env.CLIENT_ID,
    redirect_uri: process.env.REDIRECT_URI, // MUST MATCH DASHBOARD
    scope,
    state: userId // safely send userId
  })}`;

  return res.redirect(authUrl);
});

/* ============================================================
   CALLBACK (state = userId)
===============================================================*/
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  const userId = req.query.state; // 👈 FIXED: take from state

  if (!code || !userId)
    return res.send("❌ Missing code or user ID in callback");

  try {
    const tokenRes = await axios.post(
      "https://accounts.spotify.com/api/token",
      qs.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.REDIRECT_URI, // MUST MATCH
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const data = tokenRes.data;

    data.expires_at = Date.now() + data.expires_in * 1000;

    fs.writeFileSync(
      path.join(TOKEN_DIR, `${userId}.json`),
      JSON.stringify(data, null, 2)
    );

    return res.send(`
      <h1>🎉 Successfully Logged In</h1>
      <p>You can return to Discord now!</p>
    `);

  } catch (err) {
    console.error("Callback Error:", err.response?.data || err);
    return res.send("❌ Error fetching tokens");
  }
});

/* ============================================================
   BOT FETCH TOKENS
===============================================================*/
app.get("/gettokens", (req, res) => {
  const userId = req.query.user;
  if (!userId) return res.status(400).json({ error: "No user ID" });

  const file = path.join(TOKEN_DIR, `${userId}.json`);
  if (!fs.existsSync(file))
    return res.status(404).json({ error: "Tokens not found" });

  return res.json(JSON.parse(fs.readFileSync(file)));
});

/* ============================================================
   AUTO TOKEN REFRESH
===============================================================*/
setInterval(async () => {
  const files = fs.readdirSync(TOKEN_DIR).filter(f => f.endsWith(".json"));

  for (const file of files) {
    try {
      const userId = file.replace(".json", "");
      const filePath = path.join(TOKEN_DIR, file);
      const tokenData = JSON.parse(fs.readFileSync(filePath));

      if (!tokenData.refresh_token) continue;

      const now = Date.now();
      if (now < (tokenData.expires_at || 0) - 60000) continue;

      const response = await axios.post(
        "https://accounts.spotify.com/api/token",
        qs.stringify({
          grant_type: "refresh_token",
          refresh_token: tokenData.refresh_token,
          client_id: process.env.CLIENT_ID,
          client_secret: process.env.CLIENT_SECRET
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );

      tokenData.access_token = response.data.access_token;
      tokenData.expires_at = Date.now() + response.data.expires_in * 1000;

      fs.writeFileSync(filePath, JSON.stringify(tokenData, null, 2));
      console.log(`🔄 Refreshed token for ${userId}`);

    } catch (err) {
      console.log("Refresh Error:", err.response?.data || err);
    }
  }

}, 40 * 60 * 1000);

/* ============================================================
   START SERVER
===============================================================*/
app.listen(PORT, () =>
  console.log(`🎧 Lyro Spotify OAuth running on PORT ${PORT}`)
);
