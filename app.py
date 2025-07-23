# app.py

from flask import Flask, request, jsonify, render_template
import os
import psycopg2
from datetime import datetime

app = Flask(__name__)

# --- Database Connection ---
DATABASE_URL = os.environ.get('DATABASE_URL')

def get_db_connection():
    if not DATABASE_URL:
        # Better error message if DATABASE_URL is missing
        raise ValueError("DATABASE_URL environment variable is not set. Please set it in Render dashboard.")
    conn = psycopg2.connect(DATABASE_URL)
    return conn

# --- Initialize Database ---
def create_table_if_not_exists():
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS sms_messages (
                id SERIAL PRIMARY KEY,
                sender VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                timestamp TIMESTAMP NOT NULL,
                type VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.commit()
        print("Database table 'sms_messages' ensured.")
    except Exception as e:
        print(f"Error creating table during startup: {e}")
        # Log this more seriously in production
        # You might want to exit here if DB connection is critical for startup
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

with app.app_context():
    create_table_if_not_exists()


# --- API Endpoint for SMS Upload ---
@app.route('/sms_upload', methods=['POST'])
def sms_upload():
    sender = request.form.get('sender')
    message_body = request.form.get('message')
    timestamp_ms = request.form.get('timestamp')
    msg_type = request.form.get('type')

    if not all([sender, message_body, timestamp_ms, msg_type]):
        return jsonify({"status": "error", "message": "Missing data. Required: sender, message, timestamp, type"}), 400

    conn = None
    cur = None
    try:
        timestamp = datetime.fromtimestamp(int(timestamp_ms) / 1000)

        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO sms_messages (sender, message, timestamp, type) VALUES (%s, %s, %s, %s)",
            (sender, message_body, timestamp, msg_type)
        )
        conn.commit()
        return jsonify({"status": "success", "message": "SMS stored successfully"}), 200
    except ValueError:
        return jsonify({"status": "error", "message": "Invalid timestamp format"}), 400
    except Exception as e:
        print(f"Error storing SMS: {e}")
        if conn:
            conn.rollback()
        return jsonify({"status": "error", "message": f"Server error: {str(e)}"}), 500 # Changed message for client
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

# --- Web Interface to Display SMS ---
@app.route('/')
@app.route('/sms')
def display_sms():
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT sender, message, timestamp, type FROM sms_messages ORDER BY timestamp DESC")
        sms_messages = cur.fetchall()
        
        formatted_messages = []
        for msg in sms_messages:
            formatted_messages.append({
                'sender': msg[0],
                'message': msg[1],
                'timestamp': msg[2].strftime('%Y-%m-%d %H:%M:%S'),
                'type': msg[3]
            })
        
        return render_template('index.html', sms_messages=formatted_messages)

    except Exception as e:
        print(f"Error fetching SMS for display: {e}")
        # *** CHANGED: Returning a simple HTTP 500 error instead of rendering error.html ***
        # Agar error.html nahi hai, to yahan se seedha response bhejen.
        # Ye ek basic HTML string ya JSON error ho sakta hai.
        return f"<h1>Internal Server Error</h1><p>Could not load SMS messages. Details: {str(e)}</p>", 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

# --- Web Interface to Send SMS (Removed for simplicity, if not using a dedicated page) ---
# agar aapko app.py mein /send_sms_form route nahi chahiye, to ye pura block hata sakte hain
# @app.route('/send_sms_form')
# def send_sms_form():
#     return render_template('send_sms.html') # Make sure send_sms.html exists if you keep this

if __name__ == '__main__':
    app.run(debug=True, port=os.environ.get("PORT", 5000))
