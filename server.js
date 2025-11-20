const express = require("express");
const axios = require("axios");
const qs = require("qs");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send("Spotify OAuth Server Running ✔️");
});

// LOGIN
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
    redirect_uri: process.env.REDIRECT_URI,
    state: user   // PASS USER ID SAFELY
  })}`;

  res.redirect(redirect);
});

// CALLBACK
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  const user = req.query.state; // GET USER ID HERE

  if (!code) return res.send("❌ No code provided");

  try {
    const tokenReq = await axios.post(
      "https://accounts.spotify.com/api/token",
      qs.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.REDIRECT_URI, // MUST MATCH EXACTLY
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, refresh_token } = tokenReq.data;

    res.send(`
      <h1>🎉 Successfully Logged In</h1>
      <p>User ID: ${user}</p>
      <pre>${JSON.stringify({ access_token, refresh_token }, null, 2)}</pre>
    `);
  } catch (err) {
    console.log(err.response?.data || err);
    return res.send("❌ Error fetching tokens");
  }
});

app.listen(port, () => {
  console.log("Spotify OAuth Server is running on port", port);
});
