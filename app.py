import os
from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify, session
from authlib.integrations.flask_client import OAuth
from flask import Flask, redirect, url_for, session
import requests
import smtplib
import random
from email.message import EmailMessage

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY")

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

if __name__ == '__main__':
    app.run(debug=True)