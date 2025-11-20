const express = require("express");
const axios = require("axios");
const qs = require("qs");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Lyro Spotify OAuth Server Running ✔️");
});

// ---------------------- LOGIN ----------------------
app.get("/login", (req, res) => {
  const user = req.query.user;
  if (!user) return res.send("❌ No user ID provided");

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
    redirect_uri: process.env.REDIRECT_URI + `?user=${user}`,
  })}`;

  return res.redirect(redirect);
});

// ---------------------- CALLBACK ----------------------
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  const user = req.query.user;

  if (!code) return res.send("❌ No code provided (Callback broken)");
  if (!user) return res.send("❌ Missing user ID in callback");

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

    const { access_token, refresh_token, expires_in } = tokenReq.data;

    // Fetch Spotify profile for URL
    const profileReq = await axios.get("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const profile = profileReq.data;

    // ---------------------- SAVE TOKENS TO FILE ----------------------
    const tokensDir = path.join(__dirname, "public/tokens");
    if (!fs.existsSync(tokensDir)) fs.mkdirSync(tokensDir, { recursive: true });

    const savePath = path.join(tokensDir, `${user}.json`);

    fs.writeFileSync(
      savePath,
      JSON.stringify(
        {
          userId: user,
          spotifyURL: profile.external_urls.spotify,
          access_token,
          refresh_token,
          expires_in,
          lastUpdated: Date.now(),
        },
        null,
        2
      )
    );

    console.log(`[SPOTIFY] Saved tokens for ${user}`);

    return res.send(`
      <h1>🎉 Spotify Login Successful</h1>
      <p>You may now return to Discord.</p>
    `);
  } catch (err) {
    console.error(err.response?.data || err);
    return res.send("❌ Error fetching tokens");
  }
});

// ---------------------- START SERVER ----------------------
app.listen(port, () => {
  console.log("Lyro Spotify OAuth Server is running on port", port);
});
