// server.js

const express = require("express");
const path = require("path");
const nodemailer = require("nodemailer"); // Email भेजने के लिए

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json()); // JSON body parsing ke liye
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// --- Email Transporter Setup ---
// Email भेजने के लिए SMTP सर्वर की डिटेल्स Render Environment Variables से मिलेंगी
// Render पर ये Environment Variables सेट करना अनिवार्य है:
// EMAIL_USER (जैसे आपका Gmail ईमेल पता)
// EMAIL_PASS (आपके Gmail App Password या ईमेल पासवर्ड)
// EMAIL_SERVICE (जैसे 'gmail', 'outlook', 'sendgrid' - अधिकतर cases mein 'gmail' chal jayega)
const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail', // Default to gmail
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// --- Server ki memory mein SMS data store karne ke liye array ---
// NOTE: Jab server restart hoga (Render par often hota hai), to yeh data reset ho jayega.
// Yeh permanent storage nahi hai. Isliye, data ko turant email karein.
let smsDataBuffer = []; // Temp buffer for new SMS before sending email
const EMAIL_BATCH_SIZE = 50; // Kitne SMS hone par email bhejna hai, ya ek baar mein kitne bhejne hain
const EMAIL_SEND_INTERVAL = 30 * 1000; // 30 seconds (नया SMS आने के 30 सेकंड बाद email भेजें अगर कोई batch size नहीं है)

let emailSendTimeout; // Email भेजने के लिए setTimeout handle

// Function to send buffered SMS data to email
async function sendBufferedSmsToEmail() {
    if (smsDataBuffer.length === 0) {
        return;
    }

    const recipientEmail = process.env.RECIPIENT_EMAIL; // उस ईमेल पते पर भेजें जहाँ आप SMS प्राप्त करना चाहते हैं
    if (!recipientEmail) {
        console.error("RECIPIENT_EMAIL environment variable is not set. Cannot send email.");
        smsDataBuffer = []; // Clear buffer if no recipient
        return;
    }

    const smsText = smsDataBuffer.map(sms =>
        `Type: ${sms.type.toUpperCase()}\nFrom: ${sms.address}\nMessage: ${sms.body}\nDate: ${new Date(parseInt(sms.date)).toLocaleString()}\n---`
    ).join('\n\n');

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: recipientEmail,
        subject: `SMS Backup from Phone (${smsDataBuffer.length} messages)`,
        text: smsText
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Email sent successfully with ${smsDataBuffer.length} SMS.`);
        smsDataBuffer = []; // Clear buffer after successful send
    } catch (error) {
        console.error("Error sending email:", error);
        // If email fails, keep data in buffer to retry later
    }
}

// --- API Endpoint for SMS Upload (Android App se) ---
// Is endpoint par aapka Android app har naye SMS ko bhejeega.
app.post("/upload-sms", (req, res) => {
    const { sender, message, timestamp, type } = req.body; 

    if (!sender || !message || !timestamp || !type) {
        return res.status(400).json({ status: "error", message: "Missing data." });
    }

    try {
        const date = new Date(parseInt(timestamp));
        if (isNaN(date.getTime())) {
            return res.status(400).json({ status: "error", message: "Invalid timestamp format" });
        }

        const newSms = {
            address: sender,
            body: message,
            date: timestamp,
            formattedDate: date.toLocaleString(),
            type: type
        };

        smsDataBuffer.push(newSms); // नए SMS को बफर में जोड़ें
        console.log(`📩 Received new SMS. Buffered: ${smsDataBuffer.length}`);

        // अगर बैच साइज पूरा हो गया है या टाइमआउट चल रहा है, तो ईमेल भेजें
        if (smsDataBuffer.length >= EMAIL_BATCH_SIZE) {
            clearTimeout(emailSendTimeout); // अगर कोई पुराना टाइमआउट चल रहा है तो उसे हटा दें
            sendBufferedSmsToEmail(); // तुरंत ईमेल भेजें
        } else {
            // अगर बैच साइज पूरा नहीं हुआ है, तो एक नया टाइमआउट सेट करें (या मौजूदा को रीसेट करें)
            clearTimeout(emailSendTimeout);
            emailSendTimeout = setTimeout(sendBufferedSmsToEmail, EMAIL_SEND_INTERVAL);
        }

        res.status(200).json({ status: "success", message: "SMS received." });

    } catch (err) {
        console.error("Error processing SMS upload:", err);
        return res.status(500).json({ status: "error", message: `Server error: ${err.message}` });
    }
});

// --- API Endpoint to Request All Stored SMS (for "Send All" button) ---
// Jab app "Send All" button dabayega, to saare pending SMS yahan bhejega.
// Is endpoint par SMS data JSON array mein receive hoga.
app.post("/upload-all-sms", async (req, res) => {
    const allSmsData = req.body; // Expecting an array of SMS objects
    
    if (!Array.isArray(allSmsData) || allSmsData.length === 0) {
        return res.status(400).json({ status: "error", message: "No SMS data provided for batch upload." });
    }

    const recipientEmail = process.env.RECIPIENT_EMAIL;
    if (!recipientEmail) {
        console.error("RECIPIENT_EMAIL environment variable is not set. Cannot send email.");
        return res.status(500).json({ status: "error", message: "Email recipient not configured on server." });
    }

    const smsText = allSmsData.map(sms =>
        `Type: ${sms.type.toUpperCase() || 'UNKNOWN'}\nFrom: ${sms.sender || 'Unknown'}\nMessage: ${sms.body || 'No Message'}\nDate: ${new Date(parseInt(sms.timestamp)).toLocaleString() || 'Unknown'}\n---`
    ).join('\n\n');

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: recipientEmail,
        subject: `Batch SMS Backup from Phone (${allSmsData.length} messages)`,
        text: smsText
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Batch email sent successfully with ${allSmsData.length} SMS.`);
        res.status(200).json({ status: "success", message: `Batch of ${allSmsData.length} SMS sent to email.` });
    } catch (error) {
        console.error("Error sending batch email:", error);
        res.status(500).json({ status: "error", message: `Error sending batch email: ${error.message}` });
    }
});


// --- Web Interface (Simple page to confirm server is running) ---
app.get(['/', '/status'], (req, res) => {
    // Ye sirf ek basic page hai yeh confirm karne ke liye ki server chal raha hai
    res.send("<h1>SMS Forwarding Server is Running!</h1><p>Waiting for SMS from your Android app.</p>");
});

// --- Server Start ---
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`Waiting for SMS uploads from app...`);
});

