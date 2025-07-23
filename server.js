// server.js

const express = require('express');
const { Pool } = require('pg'); // PostgreSQL client
const path = require('path');
const app = express();
const port = process.env.PORT || 5000; // Render PORT environment variable ko use karega

// --- Middleware ---
// JSON body parsing ke liye (app se JSON data receive karne ke liye)
app.use(express.json());
// URL-encoded body parsing ke liye (agar aap future mein form data handle karte hain)
app.use(express.urlencoded({ extended: true }));

// Views (templates) directory set karein
app.set('views', path.join(__dirname, 'views'));
// Template engine set karein (ejs ek simple template engine hai, aap handlebars ya pug bhi use kar sakte hain)
// Jinja2 ki tarah, EJS HTML ke andar JS code likhne deta hai.
app.set('view engine', 'ejs');

// --- Database Connection ---
// Render Environment Variables se database credentials lenge
// Ensure 'DATABASE_URL' environment variable is set on Render dashboard
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Render ke free tier ke liye yeh zaruri ho sakta hai
    }
});

// --- Initialize Database (Deployment par pehli baar chalane ke liye) ---
async function createTableIfNotExists() {
    try {
        const client = await pool.connect();
        await client.query(`
            CREATE TABLE IF NOT EXISTS sms_messages (
                id SERIAL PRIMARY KEY,
                sender VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                timestamp TIMESTAMP NOT NULL,
                type VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        client.release(); // Connection pool mein wapas release karein
        console.log("Database table 'sms_messages' ensured.");
    } catch (err) {
        console.error("Error creating table:", err);
        // Real application mein aap yahan par detailed logging karte.
    }
}

// Ensure table is created when the app starts
createTableIfNotExists();

// --- API Endpoint for SMS Upload ---
app.post('/sms_upload', async (req, res) => {
    // Android app se JSON data receive karenge
    // App ko data JSON format mein bhejna hoga ({"sender": "...", "message": "...", "timestamp": ..., "type": "..."})
    const { sender, message, timestamp, type } = req.body; 

    // Basic input validation
    if (!sender || !message || !timestamp || !type) {
        return res.status(400).json({ status: "error", message: "Missing data. Required: sender, message, timestamp, type" });
    }

    try {
        // Timestamp ko milliseconds se JavaScript Date object mein convert karein
        const date = new Date(parseInt(timestamp)); 
        if (isNaN(date.getTime())) { // Invalid date check
            return res.status(400).json({ status: "error", message: "Invalid timestamp format" });
        }

        const client = await pool.connect();
        // Prepared statement ka upyog SQL injection se bachne ke liye
        await client.query(
            "INSERT INTO sms_messages (sender, message, timestamp, type) VALUES ($1, $2, $3, $4)",
            [sender, message, date, type]
        );
        client.release(); // Connection pool mein wapas release karein
        return res.status(200).json({ status: "success", message: "SMS stored successfully" });
    } catch (err) {
        console.error("Error storing SMS:", err);
        return res.status(500).json({ status: "error", message: `Server error: ${err.message}` });
    }
});

// --- Web Interface to Display SMS ---
app.get(['/', '/sms'], async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query("SELECT sender, message, timestamp, type FROM sms_messages ORDER BY timestamp DESC");
        client.release();

        const sms_messages = result.rows.map(row => ({
            sender: row.sender,
            message: row.message,
            timestamp: row.timestamp.toLocaleString(), // Date object ko human-readable string mein convert karein
            type: row.type
        }));
        
        // 'index.ejs' template ko render karein aur formatted messages pass karein
        res.render('index', { sms_messages: sms_messages });

    } catch (err) {
        console.error("Error fetching SMS for display:", err);
        // 'error.ejs' template ko render karein agar woh maujood hai
        // Nahi to, ek simple HTTP 500 response dein
        res.status(500).render('error', { error_message: `Could not load SMS messages: ${err.message}` });
        // Agar error.ejs bhi nahi hai to:
        // res.status(500).send(`<h1>Internal Server Error</h1><p>Could not load SMS messages. Details: ${err.message}</p>`);
    }
});

// --- Server Start ---
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    console.log(`Access website at: http://localhost:${port}/sms`); // Local testing ke liye
});

