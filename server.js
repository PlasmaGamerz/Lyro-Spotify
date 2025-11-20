const express = require("express");
const axios = require("axios");
const qs = require("qs");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Make tokens folder public
app.use("/tokens", express.static(path.join(__dirname, "public/tokens")));

app.get("/", (req, res) => {
  res.send("Lyro Spotify OAuth Server Running ✔️");
});

// STEP 1 – redirect to Spotify login
app.get("/login", (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.send("No userId provided ❌");

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
    redirect_uri: process.env.REDIRECT_URI,
    state: userId // we send Discord ID to callback
  })}`;

  return res.redirect(redirect);
});

// STEP 2 – callback from Spotify
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  const userId = req.query.state; // discord user

  if (!code || !userId) return res.send("Invalid callback ❌");

  try {
    // Exchange code for tokens
    const tokenReq = await axios.post(
      "https://accounts.spotify.com/api/token",
      qs.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.REDIRECT_URI,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, refresh_token } = tokenReq.data;

    // Get profile details
    const profile = await axios.get("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const spotifyURL = profile.data.external_urls.spotify;

    // Save JSON token file
    const savePath = path.join(__dirname, "public/tokens", `${userId}.json`);

    fs.writeFileSync(
      savePath,
      JSON.stringify(
        {
          userId,
          spotifyURL,
          access_token,
          refresh_token,
          updatedAt: Date.now()
        },
        null,
        2
      )
    );

    return res.send(`
      <h1>Spotify Login Successful 🎉</h1>
      <p>You can now return to Discord.</p>
      <p>Your Spotify account is now linked with Lyro.</p>
    `);

  } catch (err) {
    console.error(err.response?.data || err);
    return res.send("Error fetching tokens ❌");
  }
});

app.listen(port, () => {
  console.log("Lyro Spotify OAuth Server running on port", port);
});
