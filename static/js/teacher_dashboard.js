import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, getDocs, addDoc, doc, updateDoc, getDoc, serverTimestamp, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
    
    let currentTeacherId = null;
    let myAllocatedClasses = [];
    
    const urlParams = new URLSearchParams(window.location.search);
    const viewAsId = urlParams.get('viewAs');
    let isViewOnly = false;

    // ================= 0. TAB SWITCHING (NATIVE APP FEEL) =================
    const navBtns = document.querySelectorAll(".nav-btn");
    const views = document.querySelectorAll(".tab-content");
    const defaultTabId = "view-dashboard";

    navBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const activeTab = document.querySelector('.tab-content.active');
            const activeTabId = activeTab ? activeTab.id : defaultTabId;
            const targetId = btn.getAttribute("data-target");

            if (activeTabId === targetId) return;

            navBtns.forEach(b => {
                b.classList.remove("bg-brand", "text-white", "shadow-[0_4px_15px_rgba(16,185,129,0.4)]");
                b.classList.add("text-slate-400", "hover:bg-darkHover", "hover:text-white");
            });
            views.forEach(v => { 
                v.classList.remove("active"); 
                v.style.display = "none"; 
            });

            btn.classList.add("bg-brand", "text-white", "shadow-[0_4px_15px_rgba(16,185,129,0.4)]");
            btn.classList.remove("text-slate-400", "hover:bg-darkHover", "hover:text-white");
            
            const targetView = document.getElementById(targetId);
            if(targetView) { 
                targetView.classList.add("active"); 
                targetView.style.display = "block"; 
            }

            if (activeTabId === defaultTabId && targetId !== defaultTabId) {
                history.pushState({ tab: targetId }, ""); 
            } else {
                history.replaceState({ tab: targetId }, "");
            }
        });
    });

    // ================= 1. AUTHENTICATE =================
    onAuthStateChanged(auth, async (user) => {
        if (!user) { 
            window.location.replace("/login"); 
            return; 
        }

        const loggedInDoc = await getDoc(doc(db, "users", user.uid));
        const loggedInRole = loggedInDoc.exists() ? loggedInDoc.data().role : null;

        if (viewAsId && loggedInRole === "admin") {
            isViewOnly = true; 
            currentTeacherId = viewAsId; 
            setupImpersonationUI(); 
            await loadTeacherData(viewAsId);
        } else if (!viewAsId && loggedInRole === "teacher") {
            currentTeacherId = user.uid; 
            await loadTeacherData(user.uid);
        } else {
            window.location.replace("/login");
        }
    });

    function setupImpersonationUI() {
        if(document.getElementById("btnOpenSessionModal")) document.getElementById("btnOpenSessionModal").classList.add("hidden");
        if(document.getElementById("btnOpenAssign")) document.getElementById("btnOpenAssign").classList.add("hidden");
        if(document.getElementById("btnOpenGlobalRemark")) document.getElementById("btnOpenGlobalRemark").classList.add("hidden");
    }

    async function loadTeacherData(targetUid) {
        const userDoc = await getDoc(doc(db, "users", targetUid));
        
        if(userDoc.exists()) {
            const data = userDoc.data();
            document.getElementById("welcomeText").innerText = `${data.name || "Professor"} ${isViewOnly ? '(View Mode)' : ''}`;
            document.getElementById("currentDateDisplay").innerText = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });

            const nameParts = (data.name||"").trim().split(/\s+/);
            let initials = "T";
            if (nameParts.length === 1) {
                initials = nameParts[0][0].toUpperCase();
            } else if (nameParts.length >= 2) {
                initials = (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
            }
            document.getElementById("userAvatarInitials").innerText = initials;

            await loadMyClasses();
            await loadMyPostedAssignments();
            await loadMyStudents(); 
            await loadRecentSessionsLog();
        }
    }

    // ================= 2. LOAD CLASSES (ERP INSIGHTS) =================
    async function loadMyClasses() {
        const q = query(collection(db, "teacher_assignments"), where("teacherId", "==", currentTeacherId));
        const snapshot = await getDocs(q);
        
        const container = document.getElementById("myClassesContainer");
        const remarkSelClass = document.getElementById("remarkSelClass");
        
        if(container) container.innerHTML = "";
        if(remarkSelClass) remarkSelClass.innerHTML = '<option value="">-- Choose Class --</option>';
        if(document.getElementById("selMyClass")) document.getElementById("selMyClass").innerHTML = '<option value="">-- Choose Class --</option>';
        if(document.getElementById("assignSelClass")) document.getElementById("assignSelClass").innerHTML = '<option value="">-- Choose Class --</option>';
        
        if(document.getElementById("statClasses")) document.getElementById("statClasses").innerText = snapshot.size;

        if(snapshot.empty) {
            if(container) container.innerHTML = "<p class='text-slate-500 col-span-2'>No classes assigned to you yet.</p>";
            return;
        }

        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const sectionStr = data.sectionId.toUpperCase();
            myAllocatedClasses.push({ id: docSnap.id, ...data });

            // Fetch Total Students in this class
            const stQ = query(collection(db, "users"), where("role", "==", "student"), where("section", "==", sectionStr));
            const totalStudents = (await getDocs(stQ)).size;

            if(container) {
                container.innerHTML += `
                    <div class="p-6 border border-slate-100 bg-white rounded-2xl shadow-[0_4px_15px_rgba(0,0,0,0.03)] hover:-translate-y-1 transition-transform">
                        <div class="flex justify-between items-start mb-4 border-b border-slate-50 pb-3">
                            <div class="bg-blue-50 text-blue-600 w-12 h-12 rounded-xl flex items-center justify-center text-xl"><i class="fa-solid fa-chalkboard"></i></div>
                            <span class="bg-brand/10 text-brand font-black px-3 py-1 rounded-md text-[10px] uppercase tracking-wider">Sec ${sectionStr}</span>
                        </div>
                        <h3 class="font-black text-slate-800 text-lg mb-4">${data.subjectName}</h3>
                        <div class="flex justify-between items-center text-xs font-bold text-slate-500">
                            <p><i class="fa-solid fa-users mr-1"></i> ${totalStudents} Students</p>
                        </div>
                    </div>
                `;
            }

            const optionHTML = `<option value="${sectionStr}|${data.subjectName}">${data.subjectName} (Sec: ${sectionStr})</option>`;
            if(remarkSelClass) remarkSelClass.innerHTML += `<option value="${sectionStr}">${sectionStr}</option>`;
            if(document.getElementById("selMyClass")) document.getElementById("selMyClass").innerHTML += optionHTML;
            if(document.getElementById("assignSelClass")) document.getElementById("assignSelClass").innerHTML += optionHTML;
        }
    }

    // ================= 3. RECENT SESSION LOGS =================
    async function loadRecentSessionsLog() {
        const container = document.getElementById("recentSessionsLog");
        if(!container) return;

        const q = query(collection(db, "attendance_sessions"), where("teacherId", "==", currentTeacherId), orderBy("createdAt", "desc"), limit(5));
        const snapshot = await getDocs(q);

        container.innerHTML = "";
        if(snapshot.empty) {
            container.innerHTML = "<p class='text-slate-500 text-sm'>No attendance sessions conducted yet.</p>";
            return;
        }

        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const dateStr = data.createdAt ? new Date(data.createdAt.toDate()).toLocaleString() : 'N/A';
            
            // Calculate how many attended this specific session
            const marksQ = query(collection(db, "attendance_marks"), where("sessionId", "==", docSnap.id));
            const attendeesCount = (await getDocs(marksQ)).size;

            container.innerHTML += `
                <div class="p-4 border border-slate-100 bg-slate-50 rounded-xl shadow-sm flex justify-between items-center">
                    <div>
                        <p class="font-bold text-slate-800 text-sm">${data.subject} <span class="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded ml-2">SEC ${data.sectionId}</span></p>
                        <p class="text-xs text-slate-500 mt-1"><i class="fa-solid fa-clock mr-1"></i> ${dateStr}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-2xl font-black text-brand">${attendeesCount}</p>
                        <p class="text-[9px] uppercase font-bold text-slate-400">Present</p>
                    </div>
                </div>
            `;
        }
    }

    // ================= 4. LOAD MY STUDENTS (ACTIONS ADDED) =================
    async function loadMyStudents() {
        const container = document.getElementById("myStudentsListContainer");
        if(!container) return;

        if(myAllocatedClasses.length === 0) {
            container.innerHTML = "<p class='text-slate-500 text-center py-10'>No sections allocated to you yet.</p>";
            return;
        }

        const mySections = myAllocatedClasses.map(c => c.sectionId.toUpperCase());
        const q = query(collection(db, "users"), where("role", "==", "student"), where("section", "in", mySections));
        const snapshot = await getDocs(q);

        if(snapshot.empty) {
            container.innerHTML = "<p class='text-slate-500 text-center py-10'>No students found in your allocated sections.</p>";
            return;
        }

        let html = `<table class="w-full text-left min-w-[600px]"><thead class="bg-slate-50 border-b border-slate-200 text-[11px] font-black uppercase tracking-wider text-slate-500"><tr><th class="px-6 py-4">Student Details</th><th class="px-6 py-4">Section</th><th class="px-6 py-4 text-right">Actions</th></tr></thead><tbody class="divide-y divide-slate-100">`;
        
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            html += `<tr class="hover:bg-slate-50 transition">
                <td class="px-6 py-4">
                    <p class="font-bold text-slate-800">${data.name}</p>
                    <p class="text-[11px] text-slate-500">${data.email}</p>
                </td>
                <td class="px-6 py-4 font-black text-blue-600 bg-blue-50 rounded-lg inline-block mt-3 ml-6 px-3 py-1 text-xs">${data.section}</td>
                <td class="px-6 py-4 text-right">
                    <button class="bg-slate-100 hover:bg-brand hover:text-white text-slate-600 px-4 py-2 rounded-lg text-xs font-bold transition mr-2" onclick="window.open('/student-dashboard?viewAs=${docSnap.id}', '_blank')">Dashboard</button>
                    <button class="btn-quick-remark bg-orange-100 hover:bg-orange-500 hover:text-white text-orange-600 px-4 py-2 rounded-lg text-xs font-bold transition" data-sid="${docSnap.id}" data-sname="${data.name}">Remark</button>
                </td>
            </tr>`;
        });
        html += `</tbody></table>`;
        container.innerHTML = html;
    }

    // ================= 5. GLOBAL REMARK SYSTEM =================
    const remarkModal = document.getElementById("globalRemarkModal");
    const remarkSelClass = document.getElementById("remarkSelClass");
    const remarkSelStudent = document.getElementById("remarkSelStudent");

    if(!isViewOnly && remarkModal) {
        // Quick Remark from Student List
        document.addEventListener("click", async (e) => {
            if(e.target.classList.contains("btn-quick-remark")) {
                const sid = e.target.getAttribute("data-sid");
                const sname = e.target.getAttribute("data-sname");
                document.getElementById("remarkSelClass").innerHTML = `<option value="">Direct Selection</option>`;
                remarkSelStudent.innerHTML = `<option value="${sid}">${sname}</option>`;
                remarkModal.classList.remove("hidden");
            }
        });

        // Open Modal from Header
        document.getElementById("btnOpenGlobalRemark").addEventListener("click", () => {
            remarkSelStudent.innerHTML = '<option value="">Select Class First</option>';
            remarkModal.classList.remove("hidden");
        });
        
        document.getElementById("btnCloseGlobalRemark").addEventListener("click", () => {
            remarkModal.classList.add("hidden");
        });

        // Fetch students dynamically when class is selected
        if(remarkSelClass) {
            remarkSelClass.addEventListener("change", async () => {
                const sec = remarkSelClass.value;
                if(!sec) return;
                
                remarkSelStudent.innerHTML = '<option value="">Fetching...</option>';
                const sq = query(collection(db, "users"), where("role", "==", "student"), where("section", "==", sec));
                const sSnap = await getDocs(sq);
                
                remarkSelStudent.innerHTML = '<option value="">-- Choose Student --</option>';
                sSnap.forEach(d => remarkSelStudent.innerHTML += `<option value="${d.id}">${d.data().name}</option>`);
            });
        }

        document.getElementById("btnSubmitGlobalRemark").addEventListener("click", async () => {
            const sid = remarkSelStudent.value;
            const text = document.getElementById("remarkText").value.trim();
            if(!sid || !text) {
                alert("Select student and type remark!");
                return;
            }

            const btn = document.getElementById("btnSubmitGlobalRemark");
            btn.innerHTML = "Sending..."; 
            btn.disabled = true;

            try {
                await addDoc(collection(db, "remarks"), { 
                    studentId: sid, 
                    teacherId: currentTeacherId, 
                    remark: text, 
                    timestamp: serverTimestamp() 
                });
                alert("Remark sent!");
                remarkModal.classList.add("hidden"); 
                document.getElementById("remarkText").value = "";
            } catch(e) { 
                alert("Failed to send remark."); 
            } finally { 
                btn.innerHTML = "Send Remark"; 
                btn.disabled = false; 
            }
        });
    }

    // ================= 6. LIVE ATTENDANCE (QR) =================
    const sessionModal = document.getElementById("sessionModal");
    const btnOpenSessionModal = document.getElementById("btnOpenSessionModal");
    const btnCloseSessionModal = document.getElementById("btnCloseSessionModal");
    const btnStartSession = document.getElementById("btnStartSession");
    const qrDisplayModal = document.getElementById("qrDisplayModal");
    const btnCloseQr = document.getElementById("btnCloseQr");
    const qrCodeContainer = document.getElementById("qrCodeContainer");
    const qrTimerDisplay = document.getElementById("qrTimerDisplay");

    let activeSessionId = null; 
    let countdownInterval = null; 
    let qrRefreshInterval = null;

    if(!isViewOnly && btnOpenSessionModal) {
        btnOpenSessionModal.addEventListener("click", () => sessionModal.classList.remove("hidden"));
        btnCloseSessionModal.addEventListener("click", () => sessionModal.classList.add("hidden"));
        
        btnStartSession.addEventListener("click", async () => {
            const selectedValue = document.getElementById("selMyClass").value;
            if(!selectedValue) {
                alert("Select a class first!");
                return;
            }
            const [sectionId, subjectName] = selectedValue.split("|");
            
            btnStartSession.innerHTML = `Generating...`; 
            btnStartSession.disabled = true;
            
            try {
                const now = new Date(); 
                const expiresAt = new Date(now.getTime() + 5 * 60000); // 5 mins expiry
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
                document.getElementById("qrClassDisplay").innerText = `${subjectName} (Sec: ${sectionId})`;
                
                startSessionLogic(initialToken);
            } catch (error) { 
                console.error(error); 
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
            const m = Math.floor(timeLeft / 60); 
            const s = timeLeft % 60;
            qrTimerDisplay.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            if (timeLeft <= 0) endSession(); 
        }, 1000);

        // Security: Change Token every 5 seconds
        qrRefreshInterval = setInterval(async () => {
            if(!activeSessionId) return;
            const newToken = Math.random().toString(36).substring(2, 10);
            try {
                await updateDoc(doc(db, "attendance_sessions", activeSessionId), { currentToken: newToken });
                drawQRCode(activeSessionId, newToken);
            } catch(e) {}
        }, 5000);
    }

    function drawQRCode(sessionId, token) {
        qrCodeContainer.innerHTML = ""; 
        const scanUrl = `https://acet-nexus.onrender.com/scan?session=${sessionId}&token=${token}`;
        new QRCode(qrCodeContainer, { 
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
            alert("Attendance Session Closed");
            try { 
                await updateDoc(doc(db, "attendance_sessions", activeSessionId), { isActive: false }); 
            } catch(e) {}
        }
        activeSessionId = null;
    }
    
    if (btnCloseQr) {
        btnCloseQr.addEventListener("click", () => { 
            if (confirm("End session?")) endSession(); 
        });
    }

    // ================= 7. POST ASSIGNMENTS & VIEW SUBMISSIONS =================
    const assignModal = document.getElementById("assignModal");
    if(!isViewOnly && assignModal) {
        document.getElementById("btnOpenAssign").addEventListener("click", () => assignModal.classList.remove("hidden"));
        document.getElementById("btnCloseAssign").addEventListener("click", () => assignModal.classList.add("hidden"));
        
        document.getElementById("btnSaveAssign").addEventListener("click", async () => {
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
                    teacherId: currentTeacherId, 
                    sectionId: sectionId, 
                    subjectName: subjectName, 
                    title: title, 
                    dueDate: dueDate, 
                    postedAt: new Date()
                });
                alert("Assignment Posted!"); 
                assignModal.classList.add("hidden"); 
                loadMyPostedAssignments();
            } catch (err) { 
                alert("Failed to post."); 
            }
        });
    }

    async function loadMyPostedAssignments() {
        const q = query(collection(db, "assignments"), where("teacherId", "==", currentTeacherId));
        const snapshot = await getDocs(q);
        
        if(document.getElementById("statAssignments")) {
            document.getElementById("statAssignments").innerText = snapshot.size;
        }

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
                </div>`;
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

                if(!remarkText) {
                    alert("Please type a remark before saving.");
                    return;
                }

                try {
                    await addDoc(collection(db, "remarks"), {
                        studentId: studentId, 
                        teacherId: currentTeacherId, 
                        remark: remarkText, 
                        submissionId: subId, 
                        timestamp: serverTimestamp()
                    });
                    
                    btn.innerHTML = `<i class="fa-solid fa-check mr-1"></i> Sent`;
                    btn.classList.replace("bg-brand", "bg-slate-300");
                    btn.classList.replace("hover:bg-emerald-600", "hover:bg-slate-300");
                    btn.disabled = true;
                } catch(err) {
                    console.error(err); 
                    alert("Failed to send remark.");
                }
            }
        });
    }

    // ================= 8. LOGOUT =================
    document.getElementById("btnLogout").addEventListener("click", () => {
        if(isViewOnly) window.close(); 
        else signOut(auth).then(() => window.location.replace("/login"));
    });
});