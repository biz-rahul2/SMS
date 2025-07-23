// server.js

const express = require("express");
const path = require("path");
// body-parser अब Express 4.16.0+ में built-in है, इसलिए अलग से इसकी आवश्यकता नहीं
// const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
// JSON body parsing ke liye (Android app se JSON data receive karne ke liye)
app.use(express.json());
// Static files (जैसे index.html) 'public' folder se serve karne ke liye
// Ab hum EJS templates use karenge, isliye yeh line shayad zaruri na ho,
// lekin agar aapki koi aur static file ho to yeh kaam aayegi.
// app.use(express.static("public")); 

// Views (templates) directory set karein
app.set('views', path.join(__dirname, 'views'));
// Template engine set karein (ejs ka upyog HTML render karne ke liye)
app.set('view engine', 'ejs');

// --- Server ki memory mein SMS data store karne ke liye array ---
// NOTE: Jab server restart hoga (Render par often hota hai), to yeh data reset ho jayega.
// Yeh permanent storage nahi hai.
let smsDataStore = []; 

// --- API Endpoint for SMS Upload (Android App se) ---
app.post("/upload-sms", (req, res) => {
    // Android app se JSON data receive karenge
    // Ensure app sends {"sender": "...", "message": "...", "timestamp": ..., "type": "..."}
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

        const newSms = {
            address: sender, // aapke app se 'sender' aa raha hai
            body: message,
            date: timestamp, // Original timestamp (milliseconds) bhi save kar sakte hain
            // Date object ka string version bhi save kar sakte hain agar display ke liye chahiye
            formattedDate: date.toLocaleString(),
            type: type // 'received' ya 'sent'
        };

        smsDataStore.push(newSms); // Data ko memory array mein add karein
        console.log(`📩 Received ${smsDataStore.length} SMS. Latest from: ${sender}`);
        res.status(200).json({ status: "success", message: "SMS received and stored in memory" });

    } catch (err) {
        console.error("Error processing SMS upload:", err);
        return res.status(500).json({ status: "error", message: `Server error: ${err.message}` });
    }
});

// --- API Endpoint to Get All SMS (for download) ---
app.get("/api/sms", (req, res) => {
    // `smsDataStore` se data return karein
    res.setHeader("Content-Type", "application/json");
    res.json(smsDataStore); // memory mein stored data bhejein
});

// --- Web Interface to Display SMS (and provide download link) ---
app.get(['/', '/sms'], (req, res) => {
    try {
        // 'index.ejs' template ko render karein aur memory mein stored messages pass karein
        res.render('index', { sms_messages: smsDataStore });
    } catch (err) {
        console.error("Error rendering display page:", err);
        // 'error.ejs' template ko render karein agar woh maujood hai
        res.status(500).render('error', { error_message: `Could not load page: ${err.message}` });
    }
});

// --- Server Start ---
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`Access dashboard at: http://localhost:${PORT}/sms`);
});
