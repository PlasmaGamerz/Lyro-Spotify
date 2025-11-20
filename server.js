const express = require("express");
const axios = require("axios");
const qs = require("qs");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Fix Render proxy issues
app.set("trust proxy", 1);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CONSTS
const TOKEN_DIR = path.join(__dirname, "public", "tokens");

// Create folder if not exists
if (!fs.existsSync(TOKEN_DIR)) fs.mkdirSync(TOKEN_DIR, { recursive: true });

/* ============================================================
   HOME PAGE
===============================================================*/
app.get("/", (req, res) => {
  res.send("Lyro Spotify OAuth Server Running ✔️");
});

/* ============================================================
   LOGIN (user MUST be passed from bot)
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

  const authUrl = `https://accounts.spotify.com/authorize?${qs.stringify({
    response_type: "code",
    client_id: process.env.CLIENT_ID,
    redirect_uri: `${process.env.REDIRECT_URI}?user=${userId}`,
    scope,
    state: userId
  })}`;

  return res.redirect(authUrl);
});

/* ============================================================
   CALLBACK (Spotify redirects here after login)
===============================================================*/
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  const userId = req.query.user; // important

  if (!code || !userId)
    return res.send("❌ Missing code or user ID (Callback broken)");

  try {
    const tokenRes = await axios.post(
      "https://accounts.spotify.com/api/token",
      qs.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${process.env.REDIRECT_URI}?user=${userId}`,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const data = tokenRes.data;

    // Add expiry time
    data.expires_at = Date.now() + data.expires_in * 1000;

    // Save tokens to file
    fs.writeFileSync(
      path.join(TOKEN_DIR, `${userId}.json`),
      JSON.stringify(data, null, 2)
    );

    return res.send(`
      <h1>🎉 Spotify Login Successful</h1>
      <p>You can now return to Discord!</p>
      <pre>${JSON.stringify(data, null, 2)}</pre>
    `);
  } catch (err) {
    console.error("Callback Error:", err.response?.data || err);
    return res.send("❌ Error exchanging code for tokens");
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

  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  return res.json(data);
});

/* ============================================================
   AUTO REFRESH TOKENS
===============================================================*/
setInterval(async () => {
  const files = fs.readdirSync(TOKEN_DIR).filter(f => f.endsWith(".json"));
  if (files.length === 0) return;

  console.log("🔄 Auto Refresh: Checking all Spotify tokens...");

  for (const file of files) {
    try {
      const userId = file.replace(".json", "");
      const filePath = path.join(TOKEN_DIR, file);
      const tokenData = JSON.parse(fs.readFileSync(filePath, "utf8"));

      if (!tokenData.refresh_token) continue;

      const now = Date.now();
      const expires = tokenData.expires_at || 0;

      if (now < expires - 60000) continue; // refresh 1 min early

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

      console.log(`🔄 Refreshed token for user ${userId}`);

    } catch (err) {
      console.error("❌ Failed to refresh token:", err.response?.data || err);
    }
  }
}, 40 * 60 * 1000); // every 40 minutes

/* ============================================================
   START SERVER
===============================================================*/
app.listen(PORT, () => {
  console.log(`🎧 Lyro Spotify OAuth Server running on PORT ${PORT}`);
});
