from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import json

app = Flask(__name__)
CORS(app)
SMS_FILE = 'sms_data.json'
SEND_QUEUE_FILE = 'send_queue.json'

def get_sms():
    if os.path.exists(SMS_FILE):
        with open(SMS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def save_sms(sms_list):
    with open(SMS_FILE, 'w', encoding='utf-8') as f:
        json.dump(sms_list, f)

def get_send_queue():
    if os.path.exists(SEND_QUEUE_FILE):
        with open(SEND_QUEUE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def save_send_queue(queue):
    with open(SEND_QUEUE_FILE, 'w', encoding='utf-8') as f:
        json.dump(queue, f)

@app.route('/api/upload_sms', methods=['POST'])
def upload_sms():
    sms_list = request.get_json(force=True)
    if not isinstance(sms_list, list):
        return jsonify({"success": False, "error": "Invalid data format."}), 400
    save_sms(sms_list)
    return jsonify({'success': True})

@app.route('/api/sms', methods=['GET'])
def list_sms():
    return jsonify(get_sms())

@app.route('/api/send_sms', methods=['POST'])
def send_sms():
    # This stores outgoing SMS requests; phone will poll this queue and send them
    data = request.get_json(force=True)
    queue = get_send_queue()
    queue.append({
        "address": data.get("address"),
        "body": data.get("body"),
        "status": "pending"
    })
    save_send_queue(queue)
    return jsonify({"success": True})

@app.route('/api/queue', methods=['GET', 'POST'])
def sms_queue():
    if request.method == 'POST':
        # Phone should POST here with address/body after sending, to mark as sent
        sent_index = int(request.json.get("index"))
        queue = get_send_queue()
        if 0 <= sent_index < len(queue):
            queue[sent_index]["status"] = "sent"
            save_send_queue(queue)
        return jsonify({"success": True})
    else:
        # Phone GETs this to get the latest to-send message
        queue = get_send_queue()
        for i, msg in enumerate(queue):
            if msg.get('status')=='pending':
                return jsonify({"index": i, "address": msg["address"], "body": msg["body"]})
        return jsonify({})  # Empty = nothing to send

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

if __name__ == "__main__":
    app.run(debug=True)
