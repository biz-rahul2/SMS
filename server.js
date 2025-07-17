const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

const logsPath = path.join(__dirname, 'sms_logs.json');

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Store SMS: GET /api/sms?sender=xxx&msg=xxx
app.get('/api/sms', async (req, res) => {
    const sender = req.query.sender;
    const msg = req.query.msg;
    const time = new Date().toISOString();

    if (!sender || !msg) return res.status(400).send("Missing params");

    const newEntry = { sender, msg, time };

    let logs = [];
    if (await fs.pathExists(logsPath)) {
        logs = await fs.readJSON(logsPath);
    }

    logs.unshift(newEntry); // Newest on top
    await fs.writeJSON(logsPath, logs, { spaces: 2 });

    res.send("OK");
});

// Show all logs: GET /api/logs
app.get('/api/logs', async (req, res) => {
    if (!await fs.pathExists(logsPath)) return res.json([]);
    const logs = await fs.readJSON(logsPath);
    res.json(logs);
});

app.listen(PORT, () => {
    console.log(`SMS Server running on http://localhost:${PORT}`);
});
