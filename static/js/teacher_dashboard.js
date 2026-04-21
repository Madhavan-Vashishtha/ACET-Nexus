import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, getDocs, addDoc, doc, updateDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { showToast } from "./toast.js";

document.addEventListener("DOMContentLoaded", () => {
    
    let currentTeacherId = null;
    let myAllocatedClasses = [];
    
    const urlParams = new URLSearchParams(window.location.search);
    const viewAsId = urlParams.get('viewAs');
    let isViewOnly = false;

    // ================= 0. PREMIUM TAB SWITCHING LOGIC (FIXED) =================
    const navBtns = document.querySelectorAll(".nav-btn");
    const views = document.querySelectorAll(".tab-content");

    navBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            navBtns.forEach(b => {
                b.classList.remove("bg-brand", "text-white", "shadow-[0_4px_15px_rgba(16,185,129,0.4)]");
                b.classList.add("text-slate-400", "hover:bg-darkHover", "hover:text-white");
            });
            views.forEach(v => {
                v.classList.remove("active");
                v.style.display = "none"; // Explicit hide to fix mobile clash
            });

            btn.classList.add("bg-brand", "text-white", "shadow-[0_4px_15px_rgba(16,185,129,0.4)]");
            btn.classList.remove("text-slate-400", "hover:bg-darkHover", "hover:text-white");
            
            const targetId = btn.getAttribute("data-target");
            const targetView = document.getElementById(targetId);
            if(targetView) {
                targetView.classList.add("active");
                targetView.style.display = "block"; // Explicit show
            }

            // Auto close mobile menu if open
            const aside = document.querySelector("aside");
            if (window.innerWidth <= 992 && aside && aside.classList.contains("menu-open")) {
                aside.classList.remove("menu-open");
                document.body.style.overflow = "auto";
                if(history.state && history.state.menuOpen) {
                    history.replaceState({ tab: targetId }, ""); 
                }
            } else {
                history.pushState({ tab: targetId }, "");
            }
        });
    });

    // ================= 1. AUTHENTICATE & IMPERSONATION =================
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const loggedInDoc = await getDoc(doc(db, "users", user.uid));
            const loggedInRole = loggedInDoc.exists() ? loggedInDoc.data().role : null;

            if (viewAsId) {
                if (loggedInRole === "admin") {
                    isViewOnly = true;
                    currentTeacherId = viewAsId; 
                    setupImpersonationUI();
                    await loadTeacherData(viewAsId);
                } else {
                    alert("Unauthorized Access!");
                    window.location.href = "/login";
                }
            } else {
                if (loggedInRole === "teacher") {
                    currentTeacherId = user.uid;
                    await loadTeacherData(user.uid);
                } else {
                    window.location.href = "/login";
                }
            }
        } else {
            window.location.href = "/login";
        }
    });

    function setupImpersonationUI() {
        if(document.getElementById("btnOpenSessionModal")) document.getElementById("btnOpenSessionModal").classList.add("hidden");
        if(document.getElementById("btnOpenAssign")) document.getElementById("btnOpenAssign").classList.add("hidden");
        
        const header = document.querySelector("header");
        if(header) {
            header.insertAdjacentHTML('afterend', `
                <div class="bg-yellow-100 border-b border-yellow-200 text-yellow-800 text-center py-2 text-xs font-bold tracking-widest z-50">
                    <i class="fa-solid fa-eye mr-2"></i> VIEW ONLY MODE (ADMIN)
                </div>
            `);
        }
    }

    async function loadTeacherData(targetUid) {
        const userDoc = await getDoc(doc(db, "users", targetUid));
        if(userDoc.exists()) {
            const data = userDoc.data();
            const fullName = data.name || "Professor";
            
            document.getElementById("welcomeText").innerText = `${fullName} ${isViewOnly ? '(View Mode)' : ''}`;
            
            if(document.getElementById("currentDateDisplay")) {
                document.getElementById("currentDateDisplay").innerText = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
            }

            const nameParts = fullName.trim().split(/\s+/);
            let initials = "T";
            if (nameParts.length === 1) {
                initials = nameParts[0][0].toUpperCase();
            } else if (nameParts.length >= 2) {
                initials = (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
            }
            
            const avatarEl = document.getElementById("userAvatarInitials");
            if(avatarEl) avatarEl.innerText = initials;

            await loadMyClasses();
            await loadMyPostedAssignments();
            await loadMyStudents(); // Load students after classes
        }
    }

    // ================= 2. LOAD CLASSES =================
    async function loadMyClasses() {
        const q = query(collection(db, "teacher_assignments"), where("teacherId", "==", currentTeacherId));
        const snapshot = await getDocs(q);
        
        const container = document.getElementById("myClassesContainer");
        const selClass = document.getElementById("selMyClass");
        const assignSelClass = document.getElementById("assignSelClass");
        
        if(container) container.innerHTML = "";
        if(selClass) selClass.innerHTML = '<option value="">-- Choose Section --</option>';
        if(assignSelClass) assignSelClass.innerHTML = '<option value="">-- Choose Section --</option>';
        
        if(document.getElementById("statClasses")) document.getElementById("statClasses").innerText = snapshot.size;

        if(snapshot.empty) {
            if(container) container.innerHTML = "<p class='text-slate-500 col-span-2'>No classes assigned to you yet.</p>";
            return;
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            myAllocatedClasses.push({ id: docSnap.id, ...data });

            if(container) {
                container.innerHTML += `
                    <div class="p-6 border border-slate-100 bg-white rounded-2xl shadow-sm flex flex-col justify-between hover:-translate-y-1 transition-transform">
                        <div class="flex justify-between items-start mb-4">
                            <div class="bg-blue-50 text-blue-600 w-12 h-12 rounded-xl flex items-center justify-center text-xl"><i class="fa-solid fa-chalkboard"></i></div>
                            <span class="bg-blue-100 text-blue-700 font-bold px-3 py-1 rounded-md text-[10px] uppercase tracking-wider">Sec ${data.sectionId}</span>
                        </div>
                        <div>
                            <h3 class="font-bold text-slate-800 text-lg">${data.subjectName}</h3>
                            <p class="text-xs text-slate-500 mt-1">Official Assigned Subject</p>
                        </div>
                    </div>
                `;
            }

            const optionHTML = `<option value="${data.sectionId}|${data.subjectName}">${data.subjectName} (Section ${data.sectionId})</option>`;
            if(selClass) selClass.innerHTML += optionHTML;
            if(assignSelClass) assignSelClass.innerHTML += optionHTML;
        });
    }

    // ================= 3. LOAD MY STUDENTS =================
    async function loadMyStudents() {
        const studentContainer = document.querySelector("#view-students .bg-white");
        if(!studentContainer) return;

        if(myAllocatedClasses.length === 0) {
            studentContainer.innerHTML = "<p class='text-slate-500 text-center py-10'>No sections allocated to you yet.</p>";
            return;
        }

        const mySections = myAllocatedClasses.map(c => c.sectionId.toUpperCase());
        
        const q = query(collection(db, "users"), where("role", "==", "student"), where("section", "in", mySections));
        const snapshot = await getDocs(q);

        if(snapshot.empty) {
            studentContainer.innerHTML = "<p class='text-slate-500 text-center py-10'>No students found in your allocated sections. Make sure students have updated their section in their profile.</p>";
            return;
        }

        let html = `<table class="w-full text-left"><thead class="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th class="px-6 py-4">Student Name</th><th class="px-6 py-4">Section</th><th class="px-6 py-4">Email</th></tr></thead><tbody class="divide-y divide-slate-100">`;
        
        snapshot.forEach(doc => {
            const data = doc.data();
            html += `<tr class="hover:bg-slate-50 transition">
                <td class="px-6 py-4 font-bold text-slate-800"><i class="fa-solid fa-user text-brand/50 mr-2"></i> ${data.name}</td>
                <td class="px-6 py-4 font-bold text-brand">${data.section}</td>
                <td class="px-6 py-4 text-slate-500 text-xs">${data.email}</td>
            </tr>`;
        });
        html += `</tbody></table>`;
        studentContainer.innerHTML = html;
    }

    // ================= 4. DYNAMIC QR LIVE SESSION LOGIC =================
    const sessionModal = document.getElementById("sessionModal");
    const btnOpenSessionModal = document.getElementById("btnOpenSessionModal");
    const btnCloseSessionModal = document.getElementById("btnCloseSessionModal");
    const btnStartSession = document.getElementById("btnStartSession");
    
    const qrDisplayModal = document.getElementById("qrDisplayModal");
    const btnCloseQr = document.getElementById("btnCloseQr");
    const qrCodeContainer = document.getElementById("qrCodeContainer");
    const qrTimerDisplay = document.getElementById("qrTimerDisplay");
    const qrClassDisplay = document.getElementById("qrClassDisplay");

    let activeSessionId = null;
    let countdownInterval = null;
    let qrRefreshInterval = null;
    let qrcodeObj = null;

    if(!isViewOnly && btnOpenSessionModal) {
        btnOpenSessionModal.addEventListener("click", () => sessionModal.classList.remove("hidden"));
        btnCloseSessionModal.addEventListener("click", () => sessionModal.classList.add("hidden"));

        btnStartSession.addEventListener("click", async () => {
            const selectedValue = document.getElementById("selMyClass").value;
            if(!selectedValue) {
                if(typeof showToast === 'function') showToast("Select a class first!", "error");
                else alert("Select a class first!");
                return;
            }

            const [sectionId, subjectName] = selectedValue.split("|");
            
            btnStartSession.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Generating QR...`;
            btnStartSession.disabled = true;
            
            try {
                const now = new Date();
                const expiresAt = new Date(now.getTime() + 5 * 60000); // 5 mins
                const initialToken = Math.random().toString(36).substring(2, 10);

                const sessionRef = await addDoc(collection(db, "attendance_sessions"), {
                    teacherId: currentTeacherId, 
                    sectionId: sectionId, 
                    subject: subjectName, 
                    createdAt: now, 
                    expiresAt: expiresAt, 
                    isActive: true,
                    currentToken: initialToken
                });

                activeSessionId = sessionRef.id;
                
                sessionModal.classList.add("hidden");
                qrDisplayModal.classList.remove("hidden");
                qrClassDisplay.innerText = `${subjectName} (Sec: ${sectionId})`;
                
                startSessionLogic(initialToken);
                
                if(typeof showToast === 'function') showToast("Live Attendance Started!", "success");
                else alert("Live Attendance Started!");
                
            } catch (error) {
                console.error(error); 
                if(typeof showToast === 'function') showToast("Error starting session", "error");
                else alert("Error starting session");
            } finally {
                btnStartSession.innerHTML = "Show QR Code";
                btnStartSession.disabled = false;
            }
        });
    }

    function startSessionLogic(initialToken) {
        let timeLeft = 300; 
        qrTimerDisplay.innerText = "05:00";
        drawQRCode(activeSessionId, initialToken);

        countdownInterval = setInterval(async () => {
            timeLeft--;
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            qrTimerDisplay.innerText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

            if (timeLeft <= 0) {
                endSession(); 
            }
        }, 1000);

        qrRefreshInterval = setInterval(async () => {
            if(!activeSessionId) return;
            const newToken = Math.random().toString(36).substring(2, 10);
            try {
                await updateDoc(doc(db, "attendance_sessions", activeSessionId), {
                    currentToken: newToken
                });
                drawQRCode(activeSessionId, newToken);
            } catch(e) { console.log(e); }
        }, 5000);
    }

    function drawQRCode(sessionId, token) {
        if(!qrCodeContainer) return;
        qrCodeContainer.innerHTML = ""; 
        const scanUrl = `https://acet-nexus.onrender.com/scan?session=${sessionId}&token=${token}`;
        
        qrcodeObj = new QRCode(qrCodeContainer, {
            text: scanUrl,
            width: 250,
            height: 250,
            colorDark : "#0f172a",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
    }

    async function endSession() {
        clearInterval(countdownInterval);
        clearInterval(qrRefreshInterval);
        qrDisplayModal.classList.add("hidden");
        
        if (activeSessionId) {
            if(typeof showToast === 'function') showToast("Attendance Session Closed", "error");
            else alert("Attendance Session Closed");
            try {
                await updateDoc(doc(db, "attendance_sessions", activeSessionId), { isActive: false });
            } catch(e) { console.log(e); }
        }
        activeSessionId = null;
    }

    if (btnCloseQr) {
        btnCloseQr.addEventListener("click", () => {
            if (confirm("Are you sure you want to close this QR and end the session early?")) {
                endSession();
            }
        });
    }

    // ================= 5. POST ASSIGNMENTS =================
    const assignModal = document.getElementById("assignModal");
    if(!isViewOnly && assignModal) {
        const btnOpenAssign = document.getElementById("btnOpenAssign");
        const btnCloseAssign = document.getElementById("btnCloseAssign");
        const btnSaveAssign = document.getElementById("btnSaveAssign");

        if(btnOpenAssign) btnOpenAssign.addEventListener("click", () => assignModal.classList.remove("hidden"));
        if(btnCloseAssign) btnCloseAssign.addEventListener("click", () => assignModal.classList.add("hidden"));

        if(btnSaveAssign) {
            btnSaveAssign.addEventListener("click", async () => {
                const selectedVal = document.getElementById("assignSelClass").value;
                const title = document.getElementById("assignTitle").value.trim();
                const dueDate = document.getElementById("assignDue").value;

                if(!selectedVal || !title || !dueDate) {
                    alert("Please fill all details!");
                    return;
                }
                const [sectionId, subjectName] = selectedVal.split("|");

                try {
                    await addDoc(collection(db, "assignments"), {
                        teacherId: currentTeacherId, sectionId: sectionId, subjectName: subjectName, title: title, dueDate: dueDate, postedAt: new Date()
                    });

                    alert("Assignment Posted Successfully!");
                    assignModal.classList.add("hidden");
                    document.getElementById("assignTitle").value = "";
                    document.getElementById("assignDue").value = "";
                    loadMyPostedAssignments();
                } catch (err) {
                    console.error(err); alert("Failed to post assignment.");
                }
            });
        }
    }

    // ================= 6. LOAD ASSIGNMENTS & SUBMISSIONS =================
    async function loadMyPostedAssignments() {
        const q = query(collection(db, "assignments"), where("teacherId", "==", currentTeacherId));
        const snapshot = await getDocs(q);
        if(document.getElementById("statAssignments")) document.getElementById("statAssignments").innerText = snapshot.size;

        const container = document.getElementById("postedAssignmentsContainer");
        if(!container) return;
        
        container.innerHTML = "";

        if(snapshot.empty) {
            container.innerHTML = "<p class='text-slate-500 text-sm'>No assignments posted yet.</p>";
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            const formattedDate = new Date(data.dueDate).toLocaleDateString();
            
            container.innerHTML += `
                <div class="flex justify-between items-center p-5 bg-white border border-slate-100 shadow-sm rounded-2xl hover:shadow-md transition">
                    <div>
                        <p class="font-bold text-slate-800">${data.title}</p>
                        <p class="text-[11px] font-bold text-slate-500 mt-1 uppercase">Sec: <span class="text-brand">${data.sectionId}</span> | Due: <span class="text-red-500">${formattedDate}</span></p>
                    </div>
                    <button class="btn-view-subs bg-brand/10 text-brand hover:bg-brand hover:text-white font-bold text-xs px-4 py-2.5 rounded-xl transition" data-id="${doc.id}" data-title="${data.title}">
                        View Submissions
                    </button>
                </div>
            `;
        });
    }

    const submissionsModal = document.getElementById("submissionsModal");
    const submissionsList = document.getElementById("submissionsList");

    if(document.getElementById("btnCloseSubmissions")) {
        document.getElementById("btnCloseSubmissions").addEventListener("click", () => submissionsModal.classList.add("hidden"));
    }

    const postedAssignmentsContainer = document.getElementById("postedAssignmentsContainer");
    if(postedAssignmentsContainer) {
        postedAssignmentsContainer.addEventListener("click", async (e) => {
            if(e.target.closest('.btn-view-subs')) {
                const btn = e.target.closest('.btn-view-subs');
                const assignmentId = btn.getAttribute("data-id");
                
                document.getElementById("subModalTitle").innerText = btn.getAttribute("data-title");
                submissionsModal.classList.remove("hidden");
                submissionsList.innerHTML = "<p class='text-sm text-slate-500'><i class='fa-solid fa-spinner fa-spin mr-2'></i> Fetching submissions...</p>";

                const subQ = query(collection(db, "assignment_submissions"), where("assignmentId", "==", assignmentId));
                const subSnap = await getDocs(subQ);

                submissionsList.innerHTML = "";
                if(subSnap.empty) {
                    submissionsList.innerHTML = "<p class='text-sm text-slate-500'>No students have submitted this task yet.</p>";
                    return;
                }

                for(const subDoc of subSnap.docs) {
                    const subData = subDoc.data();
                    const userDoc = await getDoc(doc(db, "users", subData.studentId));
                    const studentName = userDoc.exists() ? userDoc.data().name : "Unknown Student";
                    
                    const remarkActionHTML = isViewOnly ? 
                        `<p class="text-xs text-orange-500 font-bold mt-2"><i class="fa-solid fa-lock"></i> Remarks disabled in View Mode</p>` :
                        `<div class="flex gap-2 mt-4">
                            <input type="text" id="remark-${subDoc.id}" placeholder="Give a remark or grade..." class="flex-1 text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-brand">
                            <button class="btn-save-remark bg-brand text-white font-bold text-xs px-5 py-2 rounded-xl hover:bg-emerald-600 shadow-sm transition" data-subid="${subDoc.id}" data-studentid="${subData.studentId}">
                                Send Remark
                            </button>
                        </div>`;

                    submissionsList.innerHTML += `
                        <div class="p-5 border border-slate-100 rounded-2xl bg-white shadow-sm mb-3">
                            <div class="flex justify-between items-center mb-3 border-b border-slate-50 pb-2">
                                <p class="font-bold text-sm text-slate-800"><i class="fa-solid fa-user-graduate text-brand mr-2"></i>${studentName}</p>
                            </div>
                            <div class="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm text-slate-600 break-words shadow-inner">
                                ${subData.answer}
                            </div>
                            ${remarkActionHTML}
                        </div>
                    `;
                }
            }
        });
    }

    if(!isViewOnly && submissionsList) {
        submissionsList.addEventListener("click", async (e) => {
            if(e.target.closest('.btn-save-remark')) {
                const btn = e.target.closest('.btn-save-remark');
                const subId = btn.getAttribute("data-subid");
                const studentId = btn.getAttribute("data-studentid");
                const remarkText = document.getElementById(`remark-${subId}`).value.trim();

                if(!remarkText) return alert("Please type a remark before saving.");

                try {
                    await addDoc(collection(db, "remarks"), {
                        studentId: studentId, teacherId: currentTeacherId, remark: remarkText, submissionId: subId, timestamp: serverTimestamp()
                    });
                    
                    btn.innerHTML = `<i class="fa-solid fa-check mr-1"></i> Sent`;
                    btn.classList.replace("bg-brand", "bg-slate-300");
                    btn.classList.replace("hover:bg-emerald-600", "hover:bg-slate-300");
                    btn.disabled = true;
                } catch(err) {
                    console.error(err); alert("Failed to send remark.");
                }
            }
        });
    }

    // ================= 7. LOGOUT =================
    const btnLogout = document.getElementById("btnLogout");
    if(btnLogout) {
        btnLogout.addEventListener("click", () => {
            if(isViewOnly) window.close(); 
            else signOut(auth).then(() => window.location.href = "/login");
        });
    }
});