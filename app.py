import os
from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from authlib.integrations.flask_client import OAuth
import requests
import smtplib
import random
from email.message import EmailMessage
# import google.generativeai as genai

import firebase_admin
from firebase_admin import credentials, auth as admin_auth, firestore 

load_dotenv()

# GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

# if GEMINI_API_KEY:
#     genai.configure(api_key=GEMINI_API_KEY)
# else:
#     print("WARNING: GEMINI_API_KEY not found in .env file!")

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY")

db = None 

cert_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
if cert_path and not firebase_admin._apps:
    try:
        cred = credentials.Certificate(cert_path)
        firebase_admin.initialize_app(cred)
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


#-----------CHECK USERNAME API

@app.route('/check-username', methods=['POST'])
def check_username():
    try:
        data = request.get_json()
        username = data.get('username')
        
        if not username or not db:
            return jsonify({'exists': False})
            
        # Check if username exists in Firestore db
        users_ref = db.collection('users')
        query = users_ref.where('username', '==', username).limit(1).stream()
        
        # If any document is found, username exists
        exists = any(True for _ in query)
        return jsonify({'exists': exists})
        
    except Exception as e:
        print(f"Username check error: {e}")
        return jsonify({'exists': False}), 500



#-----------OTP BACKEND LOGIC

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
    



#----------ADMIN API: DELETE USER

@app.route('/delete-user', methods=['POST'])
def delete_user():
    data = request.json
    uid = data.get('uid')
    
    if not uid:
        return jsonify({'success': False, 'message': 'UID is required'}), 400

    try:
        # admin use this to delete user
        admin_auth.delete_user(uid)
        return jsonify({'success': True, 'message': 'User deleted from Authentication.'})
    except Exception as e:
        print(f"Error deleting user: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500
    
@app.route('/resume')
def resume_builder():
    return render_template('resume.html')

# @app.route('/api/generate-resume', methods=['POST'])
# def generate_resume_api():
#     try:
#         data = request.json
        
#         prompt = f"""
#         You are an expert resume writer. Create a highly professional, visually appealing, and ATS-friendly resume in PURE HTML format based on the user data provided below.
        
#         Rules:
#         1. Use inline CSS or standard Tailwind CSS classes. 
#         2. The design should be clean, minimalist, and fit perfectly on an A4 page when printed.
#         3. Do NOT wrap the response in markdown blocks like ```html. Return ONLY the raw HTML code.
#         4. Organize the sections logically: Header (Name, Contact Info), Professional Summary, Education (College, 12th, 10th), and Experience.
#         5. Enhance the experience descriptions to sound professional and impactful.

#         User Data:
#         Name: {data.get('name')}
#         Email: {data.get('email')}
#         Phone: {data.get('phone')}
#         Address: {data.get('address')}
        
#         Professional Summary/Objective: {data.get('objective')}
        
#         Education:
#         - College: {data.get('collegeName')}, Degree: {data.get('degree')}
#         - Semesters CGPA: {', '.join(data.get('semesters', []))}
#         - 12th Grade: {data.get('school12')} (Percentage: {data.get('perc12')}%)
#         - 10th Grade: {data.get('school10')} (Percentage: {data.get('perc10')}%)
        
#         Experience:
#         {data.get('experiences')}
#         """
        
#         # Using Gemini 1.5 Flash or Pro
#         model = genai.GenerativeModel('gemini-1.5-flash') 
#         response = model.generate_content(prompt)
        
#         # Clean up in case Gemini still adds markdown formatting
#         html_content = response.text.replace("```html", "").replace("```", "").strip()
        
#         return jsonify({"success": True, "resume_html": html_content})

#     except Exception as e:
#         print("Resume Gen Error:", e)
#         return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)