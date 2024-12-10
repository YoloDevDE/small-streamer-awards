require( 'dotenv' ).config();
const express = require( 'express' );
const session = require( 'express-session' );
const passport = require( 'passport' );
const TwitchStrategy = require( 'passport-twitch-new' ).Strategy;
const mysql = require( 'mysql2/promise' );
const path = require( 'path' );
const axios = require( 'axios' );
const bodyParser = require( 'body-parser' );

const app = express();
const port = process.env.PORT || 3000;
const projectRoot = path.join( __dirname, '..' );
// In-memory array to store recent logs
const logBuffer = [];

// Override console.log to store logs in logBuffer
console.log = (function (originalLog) {
    return function (...args) {
        logBuffer.push( args.join( " " ) );
        if (logBuffer.length > 100) logBuffer.shift(); // Keep the last 100 logs only
        originalLog.apply( console, args );
    };
})( console.log );

// Middleware to parse incoming request bodies
app.use( bodyParser.json() );
app.use( bodyParser.urlencoded( {extended: true} ) );
app.use( express.static( path.join( projectRoot, 'frontend' ) ) );

// Database connection pool
const pool = mysql.createPool( {
    host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME, waitForConnections: true, connectionLimit: 100, queueLimit: 0
} );

// Session configuration
app.use( session( {
    secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: true, cookie: {maxAge: 24 * 60 * 60 * 1000}
} ) );

// Passport configuration with Twitch OAuth
app.use( passport.initialize() );
app.use( passport.session() );

passport.use( new TwitchStrategy( {
    clientID: process.env.TWITCH_CLIENT_ID, clientSecret: process.env.TWITCH_CLIENT_SECRET, callbackURL: process.env.AUTH_CALLBACK_URL, scope: 'user:read:email'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // Fetch user details from the Twitch Helix API
        const helixResponse = await axios.get( 'https://api.twitch.tv/helix/users', {
            headers: {
                'Authorization': `Bearer ${accessToken}`, 'Client-Id': process.env.TWITCH_CLIENT_ID
            }
        } );

        const userProfile = helixResponse.data.data[0];
        const id = userProfile.login;
        const email = userProfile.email;
        const twitchId = userProfile.id;
        const username = userProfile.display_name || userProfile.login;

        // Check if the user exists in the database
        const [results] = await pool.execute( 'SELECT * FROM twitch_users WHERE id = ?', [id] );

        let user;
        if (results.length === 0) {
            // New user: insert into the database
            await pool.execute( 'INSERT INTO twitch_users (id, username, twitch_id, email) VALUES (?, ?, ?, ?)', [id, username, twitchId, email] );
            user = {id, username, twitchId, email, accessToken};
            done( null, user, {isNewUser: true} );
        } else {
            // Existing user: include access token in the result object
            user = {...results[0], accessToken};
            done( null, user, {isNewUser: false} );
        }

    } catch (error) {
        console.error( 'Error fetching profile from Twitch Helix:', error );
        return done( error );
    }
} ) );


passport.serializeUser( (user, done) => {
    done( null, user );
} );

passport.deserializeUser( async (user, done) => {
    try {
        // If additional DB info is needed, retrieve it here
        const [rows] = await pool.execute( 'SELECT * FROM twitch_users WHERE id = ?', [user.id] );
        const storedUser = rows[0] || user;

        // Pass the user, including accessToken, to req.user
        done( null, {...storedUser, accessToken: user.accessToken} );
    } catch (error) {
        done( error, null );
    }
} );

// Routes
app.get( '/auth/twitch', passport.authenticate( 'twitch' ) );

app.get( '/auth/twitch/callback', passport.authenticate( 'twitch', {

    failureRedirect: '/fail'
} ), (req, res) => {
    req.session.save( () => {
        const responseDetails = {
            statusCode: res.statusCode, headersSent: res.headersSent, locals: res.locals,  // Custom properties set in the response
        };
        console.log( "Response Details:", JSON.stringify( responseDetails, null, 2 ) );
        res.redirect( '/' );
    } );
} );

app.get( '/api/user', (req, res) => {
    const user = req.isAuthenticated() ? req.user : null;
    res.json( {user} );
} );

app.get( '/logout', (req, res) => {
    req.logout( err => {
        if (err) return res.status( 500 ).json( {success: false, message: 'Logout failed', error: err} );
        res.redirect( '/' );
    } );
} );

app.post( '/api/submit-clip', async (req, res) => {
    if (!req.isAuthenticated()) return res.status( 401 ).json( {success: false, message: 'User not authenticated'} );

    const {clip_url, prize_category_id} = req.body;
    if (!clip_url || !prize_category_id) {
        return res.status( 400 ).json( {success: false, message: 'Clip URL and Prize Category are required'} );
    }

    try {
        await pool.execute( 'INSERT INTO clip_submissions (clip_url, twitch_id, prize_category_id) VALUES (?, ?, ?)', [clip_url, req.user.id, prize_category_id] );
        res.json( {success: true, message: 'Clip submitted successfully'} );
    } catch (err) {
        console.error( 'Error submitting clip:', err );
        res.status( 500 ).json( {success: false, message: 'Error submitting clip', error: err} );
    }
} );

// Modified categories-clips endpoint to show all categories even without submissions
app.get( '/api/categories-clips', async (req, res) => {
    // First, get all categories
    const categoryQuery = `
        SELECT id, name
        FROM prize_category
        ORDER BY id;
    `;

    // Then, get clips for each category
    const clipsQuery = `
        SELECT DISTINCT cs.clip_url,
                        cs.id AS clip_id,
                        cs.prize_category_id,
                        pc.name AS category_name
        FROM clip_submissions cs
                 JOIN prize_category pc ON pc.id = cs.prize_category_id
        ORDER BY pc.id, cs.clip_url;
    `;

    const clipUrlPattern = /twitch\.tv\/([^/]+)\/clip\//;

    try {
        // Get all categories first
        const [categories] = await pool.execute( categoryQuery );

        // Get all clips
        const [clipResults] = await pool.execute( clipsQuery );

        // Transform into the expected format
        const formattedCategories = categories.map( category => {
            const categoryClips = clipResults
                .filter( row => row.prize_category_id === category.id )
                .reduce( (uniqueClips, row) => {
                    const match = row.clip_url.match( clipUrlPattern );
                    if (match && !uniqueClips.some( clip => clip.clipId === row.clip_id )) {
                        uniqueClips.push( {
                            clipId: row.clip_id, clipTitle: row.clip_url, streamerName: match[1]
                        } );
                    }
                    return uniqueClips;
                }, [] );

            return {
                id: category.id, name: category.name, clips: categoryClips
            };
        } );

        // Debug logging
        console.log( 'Found categories:', formattedCategories.length );
        formattedCategories.forEach( cat => {
            console.log( `Category ${cat.name} (ID: ${cat.id}) has ${cat.clips.length} clips` );
        } );

        res.json( {success: true, categories: formattedCategories} );
    } catch (err) {
        console.error( 'Error fetching categories and clips:', err );
        res.status( 500 ).json( {
            success: false, message: 'Error fetching categories and clips', error: err
        } );
    }
} );


// New batch vote endpoint
app.post( '/api/vote-clips', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status( 401 ).json( {
            success: false, message: 'User not authenticated'
        } );
    }

    const {votes} = req.body;
    if (!votes || !Array.isArray( votes )) {
        return res.status( 400 ).json( {
            success: false, message: 'votes array is required'
        } );
    }

    try {
        // Start a transaction
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // Check if user has already voted
            const [existingVotes] = await connection.execute( 'SELECT prize_category_id FROM clip_vote WHERE twitch_user_id = ?', [req.user.id] );

            if (existingVotes.length > 0) {
                await connection.rollback();
                return res.status( 400 ).json( {
                    success: false, message: 'User has already voted'
                } );
            }

            // Insert all votes
            for (const vote of votes) {
                await connection.execute( 'INSERT INTO clip_vote (twitch_user_id, prize_category_id, clip_submission_id) VALUES (?, ?, ?)', [req.user.id, vote.prize_category_id, vote.clip_submission_id] );
            }

            // Commit the transaction
            await connection.commit();
            res.json( {
                success: true, message: 'Votes submitted successfully'
            } );
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (err) {
        console.error( 'Error submitting votes:', err );
        res.status( 500 ).json( {
            success: false, message: 'Failed to submit votes', error: err
        } );
    }
} );

app.get( '/api/prize-categories', async (req, res) => {
    try {
        const [categories] = await pool.execute( 'SELECT id, name FROM prize_category' );
        res.json( {success: true, categories} );
    } catch (err) {
        console.error( 'Error fetching prize categories:', err );
        res.status( 500 ).json( {success: false, message: 'Error fetching prize categories', error: err} );
    }
} );

app.get( '/api/clip-metadata/:id', async (req, res) => {
    // Check if the user is authenticated
    if (!req.isAuthenticated() || !req.user) {
        return res.status( 401 ).json( {success: false, message: 'User not authenticated'} );
    }

    // Get the user's access token from the session (assuming it was saved on login)
    const accessToken = req.user.accessToken;
    if (!accessToken) {
        return res.status( 400 ).json( {success: false, message: 'Access token not found in session'} );
    }

    const {id} = req.params;

    try {
        // Retrieve clip URL from the database using the clip submission ID
        const [results] = await pool.execute( 'SELECT clip_url FROM clip_submissions WHERE id = ?', [id] );
        if (results.length === 0) {
            return res.status( 404 ).json( {success: false, message: 'Clip not found'} );
        }

        // Extract the clipId from the clip URL
        const clipUrl = results[0].clip_url;
        const match = clipUrl.match( /clip\/([a-zA-Z0-9_-]+)(\?|$)/ );
        const clipId = match ? match[1] : null;

        if (!clipId) {
            return res.status( 400 ).json( {success: false, message: 'Invalid clip URL format'} );
        }

        // Fetch clip metadata from Twitch API using the user's access token
        const helixResponse = await axios.get( `https://api.twitch.tv/helix/clips?id=${clipId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`, 'Client-Id': process.env.TWITCH_CLIENT_ID
            }
        } );

        if (helixResponse.data.data.length === 0) {
            return res.status( 404 ).json( {success: false, message: 'Clip metadata not found on Twitch'} );
        }

        // Extract relevant metadata
        const clipData = helixResponse.data.data[0];
        const clipMetadata = {
            title: clipData.title, streamerName: clipData.broadcaster_name, profileImageUrl: clipData.thumbnail_url, clipUrl: clipData.url,
        };

        res.json( {success: true, clipMetadata} );
    } catch (error) {
        console.error( 'Error fetching clip metadata from Twitch:', error );
        res.status( 500 ).json( {success: false, message: 'Error fetching clip metadata', error} );
    }
} );


// Test endpoint
app.get( '/', (req, res) => {
    res.sendFile( path.join( projectRoot, 'public', 'index.html' ) );
} );
// Endpoint to check if the user has already voted
app.get( '/api/has-voted', async (req, res) => {
    // Ensure the user is authenticated
    if (!req.isAuthenticated()) {
        return res.status( 401 ).json( {
            success: false, message: 'User not authenticated'
        } );
    }

    try {
        // Query the database to check if the user has any votes recorded
        const [results] = await pool.execute( 'SELECT COUNT(*) AS voteCount FROM clip_vote WHERE twitch_user_id = ?', [req.user.id] );

        // If voteCount > 0, user has voted, otherwise they haven't
        const hasVoted = results[0].voteCount > 0;

        res.json( {
            success: true, hasVoted
        } );
    } catch (error) {
        console.error( 'Error checking voting status:', error );
        res.status( 500 ).json( {
            success: false, message: 'Error checking voting status', error
        } );
    }
} );

// Start the server
app.listen( port, () => {
    console.log( `Server is running on http://localhost:${port}` );
} );
