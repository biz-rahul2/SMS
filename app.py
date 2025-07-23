# app.py

from flask import Flask, request, jsonify, render_template
import os
import psycopg2
from datetime import datetime

app = Flask(__name__)

# --- Database Connection ---
# Render Environment Variables se database credentials lenge
# Render dashboard par 'DATABASE_URL' environment variable set karna anivarya hai.
DATABASE_URL = os.environ.get('DATABASE_URL')

def get_db_connection():
    """
    PostgreSQL database se connection establish karta hai.
    """
    if not DATABASE_URL:
        raise ValueError("DATABASE_URL environment variable is not set.")
    conn = psycopg2.connect(DATABASE_URL)
    return conn

# --- Initialize Database (Render deployment par pehli baar chalane ke liye) ---
# Ye function sirf ek baar table banane ke liye hai agar woh maujood nahi hai.
# Production environments mein aap database migrations tools (jaise Alembic) use karte hain.
def create_table_if_not_exists():
    """
    'sms_messages' table banata hai agar woh maujood nahi hai.
    """
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
        cur.close()
        print("Database table 'sms_messages' ensured.")
    except Exception as e:
        # Error handling for database creation
        print(f"Error creating table: {e}")
        # Real application mein aap yahan par detailed logging karte.
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

# Ensure table is created when the app starts.
# app.app_context() Flask context ke bahar database access enable karta hai.
with app.app_context():
    create_table_if_not_exists()


# --- API Endpoint for SMS Upload ---
@app.route('/sms_upload', methods=['POST'])
def sms_upload():
    """
    Android app se SMS data receive karta hai aur database mein store karta hai.
    """
    # API key check ab nahi hai jaisa ki anurodh kiya gaya tha.
    # Security ke liye, is feature ko fir se add karne par vichar karein agar public access ki sambhavna ho.

    sender = request.form.get('sender')
    message_body = request.form.get('message')
    timestamp_ms = request.form.get('timestamp') # Android se milliseconds mein aata hai
    msg_type = request.form.get('type')

    # Basic input validation
    if not all([sender, message_body, timestamp_ms, msg_type]):
        return jsonify({"status": "error", "message": "Missing data. Required: sender, message, timestamp, type"}), 400

    conn = None
    cur = None
    try:
        # Timestamp ko milliseconds se datetime object mein convert karein
        # int() conversion zaruri hai kyunki request.form.get() string return karta hai.
        timestamp = datetime.fromtimestamp(int(timestamp_ms) / 1000)

        conn = get_db_connection()
        cur = conn.cursor()
        # Prepared statement ka upyog SQL injection se bachne ke liye
        cur.execute(
            "INSERT INTO sms_messages (sender, message, timestamp, type) VALUES (%s, %s, %s, %s)",
            (sender, message_body, timestamp, msg_type)
        )
        conn.commit() # Changes ko database mein save karein
        return jsonify({"status": "success", "message": "SMS stored successfully"}), 200
    except ValueError:
        # Agar timestamp_ms int mein convert nahi ho pata
        return jsonify({"status": "error", "message": "Invalid timestamp format"}), 400
    except Exception as e:
        # General error handling for database operations
        print(f"Error storing SMS: {e}")
        # Agar koi error hoti hai to rollback karein
        if conn:
            conn.rollback()
        return jsonify({"status": "error", "message": f"Error storing SMS: {str(e)}"}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

# --- Web Interface to Display SMS ---
@app.route('/')
@app.route('/sms') # rahulpur.fun/sms URL ke liye
def display_sms():
    """
    Database se sabhi stored SMS messages fetch karta hai aur HTML template render karta hai.
    """
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        # SMS messages ko latest se oldest order mein fetch karein
        cur.execute("SELECT sender, message, timestamp, type FROM sms_messages ORDER BY timestamp DESC")
        sms_messages = cur.fetchall() # Saare results fetch karein
        
        # Display ke liye messages ko format karein
        formatted_messages = []
        for msg in sms_messages:
            formatted_messages.append({
                'sender': msg[0],
                'message': msg[1],
                'timestamp': msg[2].strftime('%Y-%m-%d %H:%M:%S'), # datetime object ko string mein format karein
                'type': msg[3]
            })
        
        # 'index.html' template ko render karein aur formatted messages pass karein
        return render_template('index.html', sms_messages=formatted_messages)

    except Exception as e:
        # Database connection ya query error ko handle karein
        print(f"Error fetching SMS: {e}")
        return render_template('error.html', error_message=f"Error fetching SMS: {str(e)}")
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

# --- Web Interface to Send SMS (Frontend only, app integration needed) ---
# Ye sirf ek placeholder hai. SMS send karne ke liye Android app mein aur logic chahiye.
@app.route('/send_sms_form')
def send_sms_form():
    """
    SMS send karne ke liye ek simple form display karta hai (frontend placeholder).
    """
    return render_template('send_sms.html') # Agar aap send_sms.html banana chahte hain

if __name__ == '__main__':
    # Ye sirf local testing ke liye hai. Render apne aap Gunicorn use karega.
    # PORT environment variable Render dwara set kiya jayega.
    app.run(debug=True, port=os.environ.get("PORT", 5000))

