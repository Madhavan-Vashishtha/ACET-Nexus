import { auth, db } from "./firebase.js";
// 🔥 Toast import kiya (Make sure toast.js exist karti ho)
import { showToast } from "./toast.js"; 

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail // 🔥 Import added for Forgot Password
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc, setDoc, query, collection, where, getDocs, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


document.addEventListener("DOMContentLoaded", () => {

window.getSuffix = function(role) {
    if (role === "admin") return "@acet.ad.in";
    if (role === "student") return "@acet.stud.in";
    if (role === "teacher") return "@acet.teach.in";
    return "";
}

// ================= ELEMENTS =================
const name = document.getElementById("name");
const email = document.getElementById("email");
const password = document.getElementById("password");
const roleSelect = document.getElementById("roleSelect");

const regNameError = document.getElementById("regNameError");
const regEmailError = document.getElementById("regEmailError");
const regPasswordError = document.getElementById("regPasswordError");
const regRoleError = document.getElementById("regRoleError");

const confirmPassword = document.getElementById("confirmPassword");
const regConfirmError = document.getElementById("regConfirmError");
const customUsername = document.getElementById("customUsername");

const registerBtn = document.getElementById("finalRegister");

// ================= PASSWORD RULE =================
const PWD_RULE = {
  min: 8,
  u_case: /[A-Z]/,
  l_case: /[a-z]/,
  num: /[0-9]/,
  spec: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/,
};

function validatePassword(pwd) {
  const errors = [];
  if (!pwd || pwd.length < PWD_RULE.min) errors.push(`Minimum ${PWD_RULE.min} characters`);
  if (!PWD_RULE.u_case.test(pwd)) errors.push("1 uppercase letter");
  if (!PWD_RULE.l_case.test(pwd)) errors.push("1 lowercase letter");
  if (!PWD_RULE.num.test(pwd)) errors.push("1 number");
  if (!PWD_RULE.spec.test(pwd)) errors.push("1 special character");
  return errors;
}

// ================= VALIDATION =================
function validateName() {
  if (!name.value.trim()) { regNameError.innerText = "Name is required"; return false; }
  regNameError.innerText = ""; return true;
}

function validateEmail() {
  const val = email.value.trim();
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!val) { regEmailError.innerText = "Email is required"; return false; }
  if (!regex.test(val)) { regEmailError.innerText = "Invalid email"; return false; }
  regEmailError.innerText = ""; return true;
}

function validatePasswordField() {
  const val = password.value;
  if (!val) { regPasswordError.innerText = "Password is required"; return false; }
  const errors = validatePassword(val);
  if (errors.length > 0) { regPasswordError.innerText = errors.join(", "); return false; }
  regPasswordError.innerText = ""; return true;
}

function validateRole() {
  if (!roleSelect.value) { regRoleError.innerText = "Role is required"; return false; }
  regRoleError.innerText = ""; return true;
}

// ================= EMAIL EXIST CHECK =================
async function checkEmailExists() {
  const val = email.value.trim().toLowerCase();
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!val || !regex.test(val)) return false;

  const emailQuery = query(collection(db, "users"), where("email", "==", val));
  const snapshot = await getDocs(emailQuery);

  if (!snapshot.empty) {
    regEmailError.innerText = "Email already exists";
    return true;
  }
  regEmailError.innerText = "";
  return false;
}

// ================= BLUR EVENTS =================
if (name) name.addEventListener("blur", validateName);
if (email) {
  email.addEventListener("blur", async () => {
    validateEmail();
    await checkEmailExists();
  });
}
if (password) password.addEventListener("blur", validatePasswordField);
if (roleSelect) roleSelect.addEventListener("change", validateRole);


// ================= REGISTRATION WITH OTP =================
const btnSendOtp = document.getElementById("btnSendOtp");
const otpBox = document.getElementById("otpBox");
const btnVerifyOtp = document.getElementById("btnVerifyOtp");
const usernameStep = document.getElementById("usernameStep");

if(btnSendOtp) {
    btnSendOtp.addEventListener("click", async () => {
        const isNameValid = validateName();
        const isEmailValid = validateEmail();
        const isPasswordValid = validatePasswordField();
        const isRoleValid = validateRole();

        if (!isNameValid || !isEmailValid || !isPasswordValid || !isRoleValid) return;

        const emailExists = await checkEmailExists();
        if (emailExists) return;

        btnSendOtp.innerText = "Sending...";
        btnSendOtp.disabled = true;

        try {
            const res = await fetch("/send-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.value.trim().toLowerCase() })
            });
            
            const data = await res.json();
            if(data.success) {
                btnSendOtp.style.display = "none";
                otpBox.style.display = "block";
                showToast("OTP sent to your email!", "success"); // 🔥 Using Toast
            } else {
                showToast(data.message, "error"); // 🔥 Using Toast
                btnSendOtp.innerText = "Send OTP";
                btnSendOtp.disabled = false;
            }
        } catch(e) {
            console.error(e); 
            showToast("Network error.", "error");
            btnSendOtp.innerText = "Send OTP";
            btnSendOtp.disabled = false;
        }
    });
}

if(btnVerifyOtp) {
    btnVerifyOtp.addEventListener("click", async () => {
        const emailVal = email.value.trim().toLowerCase();
        const otp = document.getElementById("regOtp").value.trim();

        if(otp.length !== 6) return document.getElementById("otpError").innerText = "Enter valid 6-digit OTP";

        btnVerifyOtp.innerText = "Verifying...";

        try {
            const res = await fetch("/verify-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: emailVal, otp: otp })
            });
            
            const data = await res.json();
            if(data.success) {
                document.getElementById("step1").style.display = "none";
                document.getElementById("usernameStep").style.display = "block";
                
                let suffix = window.getSuffix(roleSelect.value);
                document.getElementById("usernameGroup").setAttribute("data-suffix", suffix);
                showToast("OTP Verified!", "success");
            } else {
                document.getElementById("otpError").innerText = "Invalid OTP!";
                btnVerifyOtp.innerText = "Verify & Continue";
            }
        } catch(e) {
            console.error(e);
        }
    });
}

// ================= FINAL REGISTER =================
if (registerBtn) {
  registerBtn.addEventListener("click", async () => {
    if (password.value !== confirmPassword.value) {
        regConfirmError.innerText = "Passwords do not match"; return;
    } else {
        regConfirmError.innerText = "";
    }

    let username = customUsername.value.trim() + window.getSuffix(roleSelect.value);
    if(!customUsername.value.trim()) {
        showToast("Choose a username", "error");
        return;
    }

    registerBtn.disabled = true;
    registerBtn.innerText = "Creating...";

    try {
        const userCred = await createUserWithEmailAndPassword(auth, email.value.trim().toLowerCase(), password.value);
        const user = userCred.user;

        await setDoc(doc(db, "users", user.uid), {
            name: name.value.trim(),
            email: email.value.trim().toLowerCase(),
            username: username,
            role: roleSelect.value,
            status: "pending", 
            createdAt: serverTimestamp()
        });

        await signOut(auth);
        showToast("Registration Successful! Pending Admin approval.", "success");
        setTimeout(() => { window.location.reload(); }, 2000);

    } catch (err) {
        regEmailError.innerText = "Registration failed";
        console.log(err);
        registerBtn.disabled = false;
        registerBtn.innerText = "Create Account";
    }
  });
}

// ================= LOGIN =================
const loginBtn = document.getElementById("loginBtn");

if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    let input = document.getElementById("loginUsername").value.trim();
    let passwordVal = document.getElementById("loginPassword").value;
    let emailToLogin = input;

    document.getElementById("loginUserError").innerText = "";
    document.getElementById("loginPassError").innerText = "";

    try {
        let userExists = false;

        if (input.includes("@acet")) {
            const q = query(collection(db, "users"), where("username", "==", input));
            const snapshot = await getDocs(q);
            if (!snapshot.empty) { userExists = true; emailToLogin = snapshot.docs[0].data().email; }
        } else {
            const q = query(collection(db, "users"), where("email", "==", input));
            const snapshot = await getDocs(q);
            if (!snapshot.empty) userExists = true;
        }

        if (!userExists) return document.getElementById("loginUserError").innerText = "User not found!";

        const userCred = await signInWithEmailAndPassword(auth, emailToLogin, passwordVal);
        const userDoc = await getDoc(doc(db, "users", userCred.user.uid));

        if(userDoc.exists()) {
            if(userDoc.data().status === "pending") {
                await signOut(auth);
                showToast("Your account is waiting for Admin Approval.", "error");
                return;
            }
            redirectUser(userDoc.data().role);
        }
    } catch (err) {
        document.getElementById("loginPassError").innerText = "Incorrect Credentials";
    }
  });
}

// ================= SECURE GOOGLE LOGIN =================
const googleBtn = document.getElementById("googleLoginBtn");

if (googleBtn) {
  googleBtn.addEventListener("click", async () => {
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        const q = query(collection(db, "users"), where("email", "==", user.email));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            await signOut(auth);
            showToast("No account found! Please register manually first.", "error");
            return;
        }

        const userData = snapshot.docs[0].data();

        if (userData.status === "pending") {
            await signOut(auth);
            showToast("Your account is waiting for Admin Approval.", "error");
            return;
        }

        redirectUser(userData.role);

    } catch (err) {
        console.error(err);
    }
  });
}

// 🔥 FORGOT PASSWORD LOGIC 🔥
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById("loginUsername").value.trim();
        
        if (!emailInput || !emailInput.includes("@")) {
            showToast("Please enter your registered email in the Username box first.", "error");
            return;
        }

        try {
            await sendPasswordResetEmail(auth, emailInput);
            showToast("Password reset link sent! Check your inbox.", "success");
        } catch (error) {
            showToast("Error: Could not send reset link.", "error");
            console.error(error);
        }
    });
}

function redirectUser(role) {
    const urlParams = new URLSearchParams(window.location.search);
    const redirectTo = urlParams.get('redirect');

    if (redirectTo === 'home') {
        window.location.href = "/";
    } else {
        if (role === "admin") window.location.href = "/admin-dashboard";
        else if (role === "student") window.location.href = "/student-dashboard";
        else if (role === "teacher") window.location.href = "/teacher-dashboard";
        else window.location.href = "/dashboard";
    }
}

});