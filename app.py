import os
from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from authlib.integrations.flask_client import OAuth
import requests
import smtplib
import random
from email.message import EmailMessage

import firebase_admin
# 🔥 FIX: Added firestore import
from firebase_admin import credentials, auth as admin_auth, firestore 

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY")

# 🔥 FIX: Global db variable
db = None 

cert_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
if cert_path and not firebase_admin._apps:
    try:
        cred = credentials.Certificate(cert_path)
        firebase_admin.initialize_app(cred)
        # 🔥 FIX: Initialize Firestore client for backend operations
        db = firestore.client() 
        print("Firebase Admin Initialized Successfully!")
    except Exception as e:
        print(f"Error initializing Firebase Admin: {e}")

SENDER_EMAIL = os.getenv("SENDER_EMAIL")
SENDER_PASSWORD = os.getenv("SENDER_PASSWORD")

oauth = OAuth(app)

google = oauth.register(
    name='google',
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    authorize_url=os.getenv("GOOGLE_AUTHORIZE_URL"),
    access_token_url=os.getenv("GOOGLE_ACCESS_TOKEN_URL"),
    userinfo_endpoint=os.getenv("GOOGLE_USERINFO_ENDPOINT"),
    jwks_uri=os.getenv("GOOGLE_JWKS_URI"),
    client_kwargs={
        "scope": "openid email profile"
    }
)


@app.route('/')
def home():
    return render_template('index.html', show_login=True, show_links=True)

@app.route('/login')
def login():
    return render_template('login.html', show_login=False, show_links=False)

@app.route('/admin-dashboard')
def admin_dashboard():
    return render_template('admin_dashboard.html', show_links=False, show_login=False)

@app.route('/teacher-dashboard')
def teacher_dashboard():
    return render_template('teacher_dashboard.html', show_links=False, show_login=False)

@app.route('/student-dashboard')
def student_dashboard():
    return render_template('student_dashboard.html', show_links=False, show_login=False)

@app.route('/profile')
def profile():
    return render_template('profile.html', show_links=False, show_login=False)

@app.route('/scan')
def scan():
    return render_template('scan.html', show_links=False, show_login=False)

# ==========================================
# 🔍 CHECK USERNAME API
# ==========================================
@app.route('/check-username', methods=['POST'])
def check_username():
    try:
        data = request.get_json()
        username = data.get('username')
        
        if not username or not db:
            return jsonify({'exists': False})
            
        # Check if username exists in Firestore
        users_ref = db.collection('users')
        query = users_ref.where('username', '==', username).limit(1).stream()
        
        # If any document is found, username exists
        exists = any(True for _ in query)
        return jsonify({'exists': exists})
        
    except Exception as e:
        print(f"Username check error: {e}")
        return jsonify({'exists': False}), 500

# ==========================================
# 🔐 OTP BACKEND LOGIC
# ==========================================
@app.route('/send-otp', methods=['POST'])
def send_otp():
    data = request.json
    email = data.get('email')
    
    if not email:
        return jsonify({'success': False, 'message': 'Email is required'}), 400

    otp = str(random.randint(100000, 999999))
    session['reg_otp'] = otp
    session['reg_email'] = email

    try:
        msg = EmailMessage()
        msg.set_content(f"Welcome to ACET Nexus!\n\nYour Registration OTP is: {otp}\n\nPlease do not share this with anyone.")
        msg['Subject'] = "ACET Nexus - Registration Verification"
        msg['From'] = SENDER_EMAIL
        msg['To'] = email

        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        server.send_message(msg)
        server.quit()

        return jsonify({'success': True, 'message': 'OTP sent successfully!'})
    except Exception as e:
        print("Email Error:", e)
        return jsonify({'success': False, 'message': 'Failed to send email. Check credentials.'}), 500

@app.route('/verify-otp', methods=['POST'])
def verify_otp():
    data = request.json
    user_otp = data.get('otp')
    email = data.get('email')

    if session.get('reg_otp') == user_otp and session.get('reg_email') == email:
        return jsonify({'success': True})
    else:
        return jsonify({'success': False, 'message': 'Invalid OTP or Email mismatch.'}), 400
    
# ==========================================
# 🗑️ ADMIN API: DELETE USER COMPLETELY
# ==========================================
@app.route('/delete-user', methods=['POST'])
def delete_user():
    data = request.json
    uid = data.get('uid')
    
    if not uid:
        return jsonify({'success': False, 'message': 'UID is required'}), 400

    try:
        # Ye admin_auth us JSON file ka use karke Firebase se user ko hamesha ke liye udayega
        admin_auth.delete_user(uid)
        return jsonify({'success': True, 'message': 'User deleted from Authentication.'})
    except Exception as e:
        print(f"Error deleting user: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)