from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
import os
import json
import datetime
import threading

app = Flask(__name__)
CORS(app)

COMMAND_FILE = 'pending_command.json'
SMS_FOLDER = "sms_files"
SEND_HISTORY = "send_history.json"

if not os.path.exists(SMS_FOLDER):
    os.makedirs(SMS_FOLDER)

# Utility: Save and load JSON safely
def save_json(fname, data):
    with open(fname, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)

def load_json(fname, fallback=None):
    if not os.path.exists(fname):
        return fallback if fallback is not None else []
    with open(fname, encoding='utf-8') as f:
        return json.load(f)

# API: Set a new pending command (eg. from index.html panel)
@app.route('/api/set_command', methods=['POST'])
def set_command():
    cmd = request.get_json(force=True)
    save_json(COMMAND_FILE, cmd)
    return jsonify({"success": True})

# API: Get+consume current command (for APK to poll)
@app.route('/api/command')
def get_command():
    # default is {"action":""}
    cmd = load_json(COMMAND_FILE, {"action":""})
    # Once read, reset command so phone does not re-handle old one
    save_json(COMMAND_FILE, {"action":""})
    return jsonify(cmd)

# API: APK uploads SMS list as TXT (with type, eg. see_today, see_all, etc)
@app.route('/api/upload_sms_txt', methods=['POST'])
def upload_sms_txt():
    sms_type = request.args.get('type', 'unknown')
    file = request.files['file']
    nowstr = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    fname = f'{SMS_FOLDER}/sms_{sms_type}_{nowstr}.txt'
    file.save(fname)
    return jsonify({"success": True, "file": fname})

# (Optional) Download last uploaded TXT file of any type
@app.route('/api/last_sms_txt/<sms_type>')
def get_last_sms_txt(sms_type):
    sms_files = sorted([f for f in os.listdir(SMS_FOLDER) if f.startswith('sms_'+sms_type+'_')])
    if not sms_files:
        return "No file", 404
    return send_file(os.path.join(SMS_FOLDER, sms_files[-1]), mimetype='text/plain')

# For index.html: See latest results (parsing TXT file)
@app.route('/api/get_last_sms/<sms_type>')
def api_get_last_sms(sms_type):
    sms_files = sorted([f for f in os.listdir(SMS_FOLDER) if f.startswith('sms_' + sms_type + '_')])
    if not sms_files:
        return jsonify([])
    path = os.path.join(SMS_FOLDER, sms_files[-1])
    with open(path, encoding='utf-8') as f:
        txt = f.read()
    # Optionally: split by "-------------------------------\n"
    chunks = txt.strip().split('-------------------------------\n')
    result = []
    for c in chunks:
        lines = c.strip().split('\n')
        d = {}
        for line in lines:
            if line.startswith("Name:"): d['name'] = line[5:].strip()
            elif line.startswith("Number:"): d['number'] = line[7:].strip()
            elif line.startswith("Date:"): d['date'] = line[5:].strip()
            elif line.startswith("Message:"): d['msg'] = line[8:].strip()
        if d: result.append(d)
    return jsonify(result)

# Web: send SMS command to phone
@app.route('/api/send_sms', methods=['POST'])
def web_send_sms():
    data = request.get_json(force=True)
    cmd = {
        "action": "send_sms",
        "number": data.get("number"),
        "body": data.get("body")
    }
    # Replace current command
    save_json(COMMAND_FILE, cmd)
    # Save to send_history
    history = load_json(SEND_HISTORY, [])
    record = {
        "to": data.get("number"),
        "body": data.get("body"),
        "sent_at": datetime.datetime.now().isoformat()
    }
    history.append(record)
    save_json(SEND_HISTORY, history)
    return jsonify({"success": True})

@app.route('/api/send_history')
def get_send_history():
    return jsonify(load_json(SEND_HISTORY, []))

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')
