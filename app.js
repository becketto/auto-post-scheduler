const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const session = require('express-session');
require('dotenv').config();

const app = express();
const port = 3000;

// In-memory storage for scheduled posts (replace with a database in production)
let scheduledPosts = [];

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static('public'));
app.use(session({
    secret: 'your_session_secret',
    resave: false,
    saveUninitialized: true,
}));

function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('hex');
}

function generateCodeChallenge(verifier) {
    return crypto.createHash('sha256').update(verifier).digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.get('/auth/twitter', (req, res) => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    req.session.codeVerifier = codeVerifier;

    const authUrl = new URL('https://twitter.com/i/oauth2/authorize');
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', process.env.TWITTER_CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', process.env.CALLBACK_URL);
    authUrl.searchParams.append('scope', 'tweet.read tweet.write users.read offline.access');
    authUrl.searchParams.append('state', 'state');
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('code_challenge_method', 'S256');

    res.redirect(authUrl.toString());
});

app.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    const { codeVerifier } = req.session;

    try {
        const tokenResponse = await axios.post('https://api.twitter.com/2/oauth2/token', null, {
            params: {
                code,
                grant_type: 'authorization_code',
                client_id: process.env.TWITTER_CLIENT_ID,
                redirect_uri: process.env.CALLBACK_URL,
                code_verifier: codeVerifier,
            },
            auth: {
                username: process.env.TWITTER_CLIENT_ID,
                password: process.env.TWITTER_CLIENT_SECRET,
            },
        });

        req.session.accessToken = tokenResponse.data.access_token;
        res.redirect('/');
    } catch (error) {
        console.error('Error in callback', error.response?.data || error.message);
        res.status(500).send('Error getting access token');
    }
});

// New route to check authentication status
app.get('/auth-status', (req, res) => {
    res.json({ authenticated: !!req.session.accessToken });
});

// New route for logout
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Could not log out, please try again');
        }
        res.sendStatus(200);
    });
});

app.post('/schedule', (req, res) => {
    if (!req.session.accessToken) {
        return res.status(401).send('Please authenticate with Twitter first');
    }

    const { content, interval } = req.body;
    const scheduledTime = new Date(Date.now() + interval * 60000);
    const postId = Date.now();

    scheduledPosts.push({ id: postId, content, scheduledTime, accessToken: req.session.accessToken });

    res.json({ id: postId, scheduledTime });
});

app.get('/scheduled', (req, res) => {
    if (!req.session.accessToken) {
        return res.status(401).send('Please authenticate with Twitter first');
    }

    const userPosts = scheduledPosts.filter(post => post.accessToken === req.session.accessToken)
        .map(({ id, content, scheduledTime }) => ({ id, content, scheduledTime }));

    res.json(userPosts);
});

app.delete('/scheduled/:id', (req, res) => {
    if (!req.session.accessToken) {
        return res.status(401).send('Please authenticate with Twitter first');
    }

    const postId = parseInt(req.params.id);
    scheduledPosts = scheduledPosts.filter(post => post.id !== postId || post.accessToken !== req.session.accessToken);

    res.sendStatus(200);
});

app.put('/scheduled/:id', (req, res) => {
    if (!req.session.accessToken) {
        return res.status(401).send('Please authenticate with Twitter first');
    }

    const postId = parseInt(req.params.id);
    const { content } = req.body;

    const postIndex = scheduledPosts.findIndex(post => post.id === postId && post.accessToken === req.session.accessToken);
    if (postIndex !== -1) {
        scheduledPosts[postIndex].content = content;
        res.sendStatus(200);
    } else {
        res.status(404).send('Post not found');
    }
});

async function postTweet(content, accessToken) {
    try {
        await axios.post('https://api.twitter.com/2/tweets',
            { text: content },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        console.log('Tweet posted successfully');
    } catch (error) {
        console.error('Error posting tweet', error.response?.data || error.message);
    }
}

function checkScheduledPosts() {
    const now = new Date();
    scheduledPosts = scheduledPosts.filter(post => {
        if (post.scheduledTime <= now) {
            postTweet(post.content, post.accessToken);
            return false;
        }
        return true;
    });
}

setInterval(checkScheduledPosts, 60000); // Check every minute

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});