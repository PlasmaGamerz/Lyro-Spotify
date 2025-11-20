const express = require("express");
const axios = require("axios");
const qs = require("qs");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Ensure tokens folder exists
const TOKENS_DIR = path.join(__dirname, "public", "tokens");
if (!fs.existsSync(TOKENS_DIR)) fs.mkdirSync(TOKENS_DIR, { recursive: true });

app.get("/", (req, res) => {
  res.send("Lyro Spotify OAuth Server Running ✔️");
});

/* ============================
        LOGIN ENDPOINT
   ============================ */
app.get("/login", (req, res) => {
  const user = req.query.user;
  if (!user) return res.send("❌ No user ID provided.");

  const scopes = [
    "user-read-email",
    "user-read-private",
    "playlist-read-private",
    "playlist-read-collaborative"
  ].join(" ");

  const redirect_url = "https://accounts.spotify.com/authorize?" + qs.stringify({
    response_type: "code",
    client_id: process.env.CLIENT_ID,
    scope: scopes,
    redirect_uri: process.env.REDIRECT_URI + `?user=${user}`,
    state: user
  });

  return res.redirect(redirect_url);
});

/* ============================
        CALLBACK ENDPOINT
   ============================ */
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  const user = req.query.user;

  if (!code || !user) return res.send("❌ Missing code or user.");

  try {
    const tokenRes = await axios.post(
      "https://accounts.spotify.com/api/token",
      qs.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.REDIRECT_URI + `?user=${user}`,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const data = {
      access_token: tokenRes.data.access_token,
      refresh_token: tokenRes.data.refresh_token,
      expires_at: Date.now() + tokenRes.data.expires_in * 1000
    };

    // Save tokens
    fs.writeFileSync(
      path.join(TOKENS_DIR, `${user}.json`),
      JSON.stringify(data, null, 2)
    );

    return res.send(`
      <h1>🎉 Spotify Login Successful!</h1>
      <p>Your Lyro bot is now linked to your Spotify profile.</p>
      <p>You may now close this page.</p>
    `);
  } catch (err) {
    console.error(err.response?.data || err);
    return res.send("❌ Error fetching tokens.");
  }
});

/* ============================
     TOKEN FETCH (for BOT)
   ============================ */
app.get("/gettokens", (req, res) => {
  const user = req.query.user;
  if (!user) return res.status(400).json({ error: "No user ID" });

  const filePath = path.join(TOKENS_DIR, `${user}.json`);
  if (!fs.existsSync(filePath))
    return res.status(404).json({ error: "User not logged in" });

  const data = JSON.parse(fs.readFileSync(filePath));

  return res.json(data);
});

/* ============================
    AUTO TOKEN REFRESH
   ============================ */
async function autoRefreshTokens() {
  const files = fs.readdirSync(TOKENS_DIR).filter(f => f.endsWith(".json"));

  for (const file of files) {
    const userId = file.split(".")[0];
    const filePath = path.join(TOKENS_DIR, file);
    const data = JSON.parse(fs.readFileSync(filePath));

    if (!data.refresh_token) continue;

    // If token expires in next 10 minutes → refresh now
    if (Date.now() < data.expires_at - 10 * 60 * 1000) continue;

    try {
      const res = await axios.post(
        "https://accounts.spotify.com/api/token",
        qs.stringify({
          grant_type: "refresh_token",
          refresh_token: data.refresh_token,
          client_id: process.env.CLIENT_ID,
          client_secret: process.env.CLIENT_SECRET
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );

      data.access_token = res.data.access_token;
      data.expires_at = Date.now() + res.data.expires_in * 1000;

      // Write updated tokens
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

      console.log(`✔ Refreshed token for ${userId}`);
    } catch (err) {
      console.error(`❌ Failed refreshing ${userId}:`, err.response?.data || err);
    }
  }
}

// Run every 5 minutes
setInterval(autoRefreshTokens, 5 * 60 * 1000);

app.listen(port, () => {
  console.log(`Lyro Spotify OAuth Server is running on port ${port}`);
});
