// server.js

const express = require("express");
const path = require("path");
const nodemailer = require("nodemailer"); 

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); // For potential future form data
// No EJS views needed if we're not rendering a web page

// --- Email Transporter Setup ---
const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail', 
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Function to send SMS data to email
async function sendSmsToEmail(smsDataArray) { // Ab ek array accept karega
    if (!smsDataArray || smsDataArray.length === 0) {
        console.log("No SMS data to send in email.");
        return;
    }

    const recipientEmail = process.env.RECIPIENT_EMAIL; 
    if (!recipientEmail) {
        console.error("RECIPIENT_EMAIL environment variable is not set. Cannot send email.");
        return;
    }

    // Email content banate samay, har SMS ko alag alag format karein
    const smsText = smsDataArray.map(sms =>
        `Type: ${sms.type ? sms.type.toUpperCase() : 'UNKNOWN'}\n` +
        `From: ${sms.sender || 'Unknown'}\n` +
        `Message: ${sms.message || 'No message body'}\n` + // Default if message is empty
        `Date: ${new Date(parseInt(sms.timestamp)).toLocaleString()}\n` +
        `---`
    ).join('\n\n'); // Har SMS ke baad do newline characters

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: recipientEmail,
        subject: `SMS from Phone (${smsDataArray.length} messages)`, // Subject mein count dikhayein
        text: smsText
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Email sent successfully with ${smsDataArray.length} SMS.`);
    } catch (error) {
        console.error("Error sending email:", error);
    }
}

// --- API Endpoint for SMS Upload (Common endpoint for all SMS) ---
// Ye endpoint ab Android app se saare SMS (single ya batch) JSON array mein receive karega.
app.post("/upload-sms", async (req, res) => {
    const smsDataArray = req.body; // Expecting an array of SMS objects
    
    if (!Array.isArray(smsDataArray) || smsDataArray.length === 0) {
        return res.status(400).json({ status: "error", message: "Invalid or empty SMS data provided." });
    }

    console.log(`Received ${smsDataArray.length} SMS for upload.`);

    try {
        // Send the received SMS array to email
        await sendSmsToEmail(smsDataArray); 
        return res.status(200).json({ status: "success", message: `Received and forwarded ${smsDataArray.length} SMS to email.` });
    } catch (error) {
        console.error("Error processing SMS upload:", error);
        return res.status(500).json({ status: "error", message: `Server error: ${error.message}` });
    }
});


// --- Web Interface (Simple page to confirm server is running) ---
// Ab koi specific web interface nahi hai. Sirf status dikhaega.
app.get(['/', '/status'], (req, res) => {
    res.send("<h1>SMS Email Forwarding Server is Running!</h1><p>This server processes SMS uploads from your Android app and forwards them to your email.</p><p>No web dashboard is available here.</p>");
});

// --- Server Start ---
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`Waiting for SMS uploads from app...`);
});

