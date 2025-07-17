const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static("public")); // For index.html

app.post("/upload-sms", (req, res) => {
    const smsData = req.body;
    if (!Array.isArray(smsData)) {
        return res.status(400).send("Invalid data");
    }

    fs.writeFileSync("sms_backup.json", JSON.stringify(smsData, null, 2));
    console.log(`📩 Received ${smsData.length} SMS`);
    res.send("✅ SMS Saved");
});

app.get("/api/sms", (req, res) => {
    if (fs.existsSync("sms_backup.json")) {
        const data = fs.readFileSync("sms_backup.json", "utf8");
        res.setHeader("Content-Type", "application/json");
        res.send(data);
    } else {
        res.status(404).send("No SMS data found.");
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
