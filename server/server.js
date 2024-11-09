require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const TwitchStrategy = require('passport-twitch-new').Strategy;
const mysql = require('mysql2');
const path = require('path');
const axios = require('axios');
const bodyParser = require('body-parser');
const {DateTime} = require('luxon');
const projectRoot = path.join(__dirname, '..'); // Navigates to "/dev/small-streamer-awards"

const app = express();
const port = process.env.PORT || 3000; // Use PORT from .env or default to 3000

// Middleware to parse incoming request bodies
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

// Serve static files from the "public" directory
app.use(express.static(path.join(projectRoot, 'public')));

// Database connection using environment variables
const connection = mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME
});

connection.connect(err => {
    if (err) {
        console.error('Error connecting to MariaDB:', err.stack);
        return;
    }
    console.log('Connected to MariaDB');
});

// Session management
app.use(session({
    secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: true, cookie: {maxAge: 24 * 60 * 60 * 1000} // 1 day
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use(new TwitchStrategy({
    clientID: process.env.TWITCH_CLIENT_ID, clientSecret: process.env.TWITCH_CLIENT_SECRET, callbackURL: 'http://localhost:3000/auth/twitch/callback', scope: 'user:read:email'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const helixResponse = await axios.get('https://api.twitch.tv/helix/users', {
            headers: {
                'Authorization': `Bearer ${accessToken}`, 'Client-Id': process.env.TWITCH_CLIENT_ID
            }
        });

        const userProfile = helixResponse.data.data[0];
        const id = userProfile.login;
        const email = userProfile.email;
        const twitchId = userProfile.id;
        const username = userProfile.display_name || userProfile.login;

        // Check if the user exists in the database
        connection.query('SELECT * FROM twitch_users WHERE id = ?', [id], (err, results) => {
            if (err) return done(err);

            if (results.length === 0) {
                // New user: insert into the database
                connection.query('INSERT INTO twitch_users (id, username, twitch_id, email) VALUES (?, ?, ?, ?)', [id, username, twitchId, email], (err, result) => {
                    if (err) return done(err);
                    done(null, {id: result.insertId, username: username}, {isNewUser: true});
                });
            } else {
                // Existing user
                return done(null, results[0]);
            }
        });
    } catch (error) {
        console.error('Error fetching profile from Twitch Helix:', error);
        return done(error);
    }
}));

// Routes for authentication and error handling, now using env variables
app.get('/auth/twitch', passport.authenticate('twitch'));

app.get('/auth/twitch/callback', passport.authenticate('twitch', {failureRedirect: '/fail'}), (req, res) => {
    console.log('Callback reached');
    if (req.authInfo && req.authInfo.isNewUser) {
        req.session.regenerate((err) => {
            if (err) return res.status(500).json({success: false, message: 'Session regeneration failed'});
            req.session.save(() => {
                console.log('New user session saved');
                res.redirect('/test');
            });
        });
    } else {
        req.session.save(() => {
            console.log('Existing user session saved');
            res.redirect('/test');
        });
    }
});

// Serialize and deserialize user
passport.serializeUser((user, done) => {
    console.log('Serializing user:', user);
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    console.log('Deserializing user with ID:', id);
    connection.query('SELECT * FROM twitch_users WHERE id = ?', [id], (err, results) => {
        if (err) return done(err);
        done(null, results.length > 0 ? results[0] : false);
    });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('/api/user', (req, res) => {
    const user = req.isAuthenticated() ? req.user : null;
    res.json({user});
});

app.get('/logout', (req, res) => {
    req.logout(err => {
        if (err) return res.status(500).json({success: false, message: 'Logout failed', error: err});
        res.redirect('/');
    });
});
app.get('/bewerbungen', (req, res) => {
    res.redirect('https://docs.google.com/forms/d/e/1FAIpQLScv_JSg8FxAYh8b6n_VuljcQGAD5o60rYStrQSx9aXTRkli-Q/viewform');
});
// API for submitting a clip
app.post('/api/submit-clip', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({success: false, message: 'User not authenticated'});
    }

    const userId = req.user.id;
    const {clip_url, prize_category_id} = req.body;

    if (!clip_url || !prize_category_id) {
        return res.status(400).json({success: false, message: 'Clip URL and Prize Category are required'});
    }

    connection.query('INSERT INTO clip_submissions (clip_url, twitch_id, prize_category_id) VALUES (?, ?, ?)', [clip_url, userId, prize_category_id], (err, result) => {
        if (err) return res.status(500).json({success: false, message: 'Error submitting clip', error: err});
        res.json({success: true, message: 'Clip submitted successfully', result});
    });
});

app.post('/api/vote-clip', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({success: false, message: 'User not authenticated'});
    }

    const userId = req.user.id;
    const {clip_submission_id, prize_category_id} = req.body;

    // Check if required fields are present
    if (!clip_submission_id || !prize_category_id) {
        return res.status(400).json({success: false, message: 'clip_submission_id and prize_category_id are required'});
    }

    // Check if the user has already voted for this prize category
    const checkVoteQuery = `
        SELECT * FROM clip_vote 
        WHERE twitch_user_id = ? AND prize_categoriy_id = ?
    `;

    connection.query(checkVoteQuery, [userId, prize_category_id], (err, results) => {
        if (err) {
            return res.status(500).json({success: false, message: 'Database query failed', error: err});
        }

        if (results.length > 0) {
            // User has already voted for this prize category
            return res.status(400).json({success: false, message: 'User has already voted for this prize category'});
        }

        // If no vote exists, insert the new vote
        const insertVoteQuery = `
            INSERT INTO clip_vote (twitch_user_id, prize_categoriy_id, clip_submission_id)
            VALUES (?, ?, ?)
        `;

        connection.query(insertVoteQuery, [userId, prize_category_id, clip_submission_id], (err, result) => {
            if (err) {
                return res.status(500).json({success: false, message: 'Failed to submit vote', error: err});
            }

            return res.json({success: true, message: 'Vote submitted successfully'});
        });
    });
});

// API for fetching prize categories
app.get('/api/prize-categories', (req, res) => {
    connection.query('SELECT id, name FROM prize_category', (err, results) => {
        if (err) return res.status(500).json({success: false, message: 'Error fetching prize categories', error: err});
        res.json({success: true, categories: results});
    });
});
app.get('/test', (req, res) => {
    res.sendFile(path.join(projectRoot, 'public', 'S4TEST.html'));
});
// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});


app.get('/api/categories-clips', (req, res) => {
    const query = `
        SELECT pc.id AS category_id, pc.name AS category_name, cs.clip_url, cs.id AS clip_id
        FROM prize_category pc
        JOIN clip_submissions cs ON pc.id = cs.prize_category_id
        ORDER BY pc.id, cs.id;  -- Sort by category and clip ID
    `;

    connection.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching categories and clips:', err);
            return res.status(500).json({success: false, message: 'Error fetching categories and clips'});
        }

        // Regex zum Filtern und Extrahieren des Streamernamens
        const clipUrlPattern = /twitch\.tv\/([^/]+)\/clip\//;

        // Funktion zum Extrahieren des Streamer-Namens aus der URL
        const extractStreamerName = (url) => {
            const match = url.match(clipUrlPattern);
            return match ? match[1] : null;
        };

        // Struktur zur Speicherung von Kategorien und Vermeidung doppelter Clips
        const categories = [];
        const seenClips = new Set(); // Set zur Überprüfung von Duplikaten
        let currentCategory = null;

        results.forEach(row => {
            // Überprüfe, ob die URL zum Muster passt und keine Duplikate vorliegen
            if (!clipUrlPattern.test(row.clip_url) || seenClips.has(row.clip_url)) return;

            // Markiere die URL als gesehen, um Duplikate zu vermeiden
            seenClips.add(row.clip_url);

            // Wenn eine neue Kategorie beginnt, erstelle eine neue Kategorie im Array
            if (!currentCategory || currentCategory.id !== row.category_id) {
                currentCategory = {
                    id: row.category_id, name: row.category_name, clips: []
                };
                categories.push(currentCategory);
            }

            // Füge den Clip zur aktuellen Kategorie hinzu, inkl. Streamername aus der URL
            currentCategory.clips.push({
                clipId: row.clip_id, clipTitle: row.clip_url,  // oder verwende einen anderen Titel, falls vorhanden
                streamerName: extractStreamerName(row.clip_url)  // Streamername aus der URL extrahieren
            });
        });

        res.json({success: true, categories});
    });
});


