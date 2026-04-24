import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, doc, getDoc, addDoc, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
    const scannerView = document.getElementById("scannerView");
    const statusView = document.getElementById("statusView");
    const statusBox = document.getElementById("statusBox");
    const btnDashboard = document.getElementById("btnDashboard");
    let html5QrcodeScanner = null;

    function showStatus(state, message, subMessage = "") {
        scannerView.classList.add("hidden");
        statusView.classList.remove("hidden");
        
        let iconHtml = "";
        if(state === "loading") iconHtml = `<div class="pulse-circle loading"><i class="fa-solid fa-spinner fa-spin"></i></div>`;
        else if(state === "success") iconHtml = `<div class="pulse-circle"><i class="fa-solid fa-check"></i></div>`;
        else if(state === "error") iconHtml = `<div class="pulse-circle error"><i class="fa-solid fa-xmark"></i></div>`;

        statusBox.innerHTML = `
            ${iconHtml}
            <h2 class="text-2xl font-black text-white mb-2">${message}</h2>
            <p class="text-sm text-slate-300">${subMessage}</p>
        `;

        if(state === "success" || state === "error") {
            btnDashboard.classList.remove("hidden");
        }
    }

    btnDashboard.addEventListener("click", () => {
        window.location.replace("/");
    });

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            const currentUrl = encodeURIComponent(window.location.href);
            window.location.replace(`/login?redirect=${currentUrl}`);
            return;
        }

        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists() && userDoc.data().role !== "student") {
            showStatus("error", "Access Denied", "Only students can mark attendance via QR.");
            return;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const sessionId = urlParams.get('session');
        const token = urlParams.get('token');

        if (sessionId && token) {
            verifyAttendance(user.uid, userDoc.data(), sessionId, token);
        } else {
            startScanner(user.uid, userDoc.data());
        }
    });

    function startScanner(studentId, studentData) {
        html5QrcodeScanner = new Html5Qrcode("reader");
        
        const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
        
        html5QrcodeScanner.start({ facingMode: "environment" }, config, 
            (decodedText) => {
                html5QrcodeScanner.stop();
                try {
                    const scannedUrl = new URL(decodedText);
                    const sId = scannedUrl.searchParams.get("session");
                    const tkn = scannedUrl.searchParams.get("token");
                    
                    if(sId && tkn) {
                        verifyAttendance(studentId, studentData, sId, tkn);
                    } else {
                        showStatus("error", "Invalid QR Code", "This QR code doesn't belong to ACET Nexus.");
                    }
                } catch(e) {
                    showStatus("error", "Invalid QR Code", "Unrecognizable format.");
                }
            },
            (errorMessage) => {
            }
        ).catch((err) => {
            showStatus("error", "Camera Error", "Please allow camera permissions to scan.");
        });
    }

    async function verifyAttendance(studentId, studentData, sessionId, token) {
        showStatus("loading", "Verifying...", "Please wait while we confirm the session.");

        try {
            const existQuery = query(collection(db, "attendance_marks"), 
                where("sessionId", "==", sessionId), 
                where("studentId", "==", studentId)
            );
            const existSnap = await getDocs(existQuery);
            if (!existSnap.empty) {
                showStatus("success", "Already Marked!", "Your attendance is already recorded for this session.");
                return;
            }

            const sessionRef = doc(db, "attendance_sessions", sessionId);
            const sessionSnap = await getDoc(sessionRef);

            if (!sessionSnap.exists()) {
                showStatus("error", "Session Not Found", "This session does not exist.");
                return;
            }

            const sessionData = sessionSnap.data();

            if (!sessionData.isActive || sessionData.status === "closed") {
                showStatus("error", "Session Closed", "The professor has ended this attendance session.");
                return;
            }

            if (sessionData.currentToken !== token) {
                showStatus("error", "QR Expired!");
                return;
            }

            await addDoc(collection(db, "attendance_marks"), {
                sessionId: sessionId,
                studentId: studentId,
                studentName: studentData.name,
                sectionId: sessionData.sectionId,
                subject: sessionData.subject,
                timestamp: serverTimestamp(),
                status: "Present"
            });

            showStatus("success", "Attendance Marked!", `Successfully recorded for ${sessionData.subject}.`);

        } catch(err) {
            console.error(err);
            showStatus("error", "Verification Failed", "A network error occurred. Try scanning again.");
        }
    }
});