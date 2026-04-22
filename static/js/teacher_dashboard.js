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

            const aside = document.querySelector("aside");
            if (window.innerWidth <= 992 && aside && aside.classList.contains("menu-open")) {
                aside.classList.remove("menu-open");
                document.body.style.overflow = "auto";
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
        try {
            const userDoc = await getDoc(doc(db, "users", targetUid));
            
            if(userDoc.exists()) {
                const data = userDoc.data();
                const fullName = data.name || "Professor";
                
                if(document.getElementById("welcomeText")) document.getElementById("welcomeText").innerText = `${fullName} ${isViewOnly ? '(View Mode)' : ''}`;
                
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
                
                if(document.getElementById("userAvatarInitials")) document.getElementById("userAvatarInitials").innerText = initials;

                await loadMyClasses();
                await loadRecentSessionsLog();
                await loadMyPostedAssignments();
                await loadMyStudents(); 
            }
        } catch (e) {
            console.error("Error loading teacher data:", e);
        }
    }

    // ================= 2. LOAD CLASSES (CRASH-PROOF & DROPDOWN POPULATOR) =================
    async function loadMyClasses() {
        try {
            const q = query(collection(db, "teacher_assignments"), where("teacherId", "==", currentTeacherId));
            const snapshot = await getDocs(q);
            
            const container = document.getElementById("myClassesContainer");
            const remarkSelClass = document.getElementById("remarkSelClass");
            const selClass = document.getElementById("selMyClass");
            const assignSelClass = document.getElementById("assignSelClass");
            
            if(container) container.innerHTML = "";
            if(remarkSelClass) remarkSelClass.innerHTML = '<option value="">-- Choose Class --</option>';
            if(selClass) selClass.innerHTML = '<option value="">-- Choose Class --</option>';
            if(assignSelClass) assignSelClass.innerHTML = '<option value="">-- Choose Class --</option>';
            
            if(document.getElementById("statClasses")) document.getElementById("statClasses").innerText = snapshot.size;

            if(snapshot.empty) {
                if(container) container.innerHTML = "<p class='text-slate-500 col-span-2'>No classes assigned to you yet.</p>";
                return;
            }

            myAllocatedClasses = [];

            for (const docSnap of snapshot.docs) {
                const data = docSnap.data();
                const secStr = (data.sectionId || "").trim().toUpperCase();
                
                if(!myAllocatedClasses.includes(secStr)) {
                    myAllocatedClasses.push(secStr);
                }

                let totalStudents = 0;
                try {
                    const stQ = query(collection(db, "users"), where("role", "==", "student"), where("section", "==", secStr));
                    totalStudents = (await getDocs(stQ)).size;
                } catch(e) { console.error("Error counting students:", e); }

                let lastAttPercent = 0;
                try {
                    const sessQ = query(collection(db, "attendance_sessions"), where("sectionId", "==", secStr));
                    const sessSnap = await getDocs(sessQ);
                    let sessionsArray = [];
                    sessSnap.forEach(d => { if(d.data().createdAt) sessionsArray.push({id: d.id, time: d.data().createdAt.toDate().getTime()}); });
                    
                    if(sessionsArray.length > 0) {
                        sessionsArray.sort((a,b) => b.time - a.time);
                        const lastSessId = sessionsArray[0].id;
                        const marksQ = query(collection(db, "attendance_marks"), where("sessionId", "==", lastSessId));
                        const attCount = (await getDocs(marksQ)).size;
                        lastAttPercent = totalStudents > 0 ? Math.round((attCount/totalStudents)*100) : 0;
                    }
                } catch(e) { console.error("Error calculating percent:", e); }

                if(container) {
                    container.innerHTML += `
                        <div class="p-6 border border-slate-100 bg-white rounded-2xl shadow-[0_4px_15px_rgba(0,0,0,0.03)] hover:-translate-y-1 transition-transform">
                            <div class="flex justify-between items-start mb-4 border-b border-slate-50 pb-3">
                                <div class="bg-blue-50 text-blue-600 w-12 h-12 rounded-xl flex items-center justify-center text-xl"><i class="fa-solid fa-chalkboard"></i></div>
                                <span class="bg-brand/10 text-brand font-black px-3 py-1 rounded-md text-[10px] uppercase tracking-wider">Sec ${secStr}</span>
                            </div>
                            <h3 class="font-black text-slate-800 text-lg mb-4">${data.subjectName}</h3>
                            <div class="flex justify-between items-center text-xs font-bold text-slate-500">
                                <p><i class="fa-solid fa-users mr-1"></i> ${totalStudents} Enrolled</p>
                                <p class="text-emerald-600 bg-emerald-50 px-2 py-1 rounded">Last Att: ${lastAttPercent}%</p>
                            </div>
                        </div>
                    `;
                }

                const optionHTML = `<option value="${secStr}|${data.subjectName}">${data.subjectName} (Sec: ${secStr})</option>`;
                if(selClass) selClass.innerHTML += optionHTML;
                if(assignSelClass) assignSelClass.innerHTML += optionHTML;
                if(remarkSelClass) remarkSelClass.innerHTML += `<option value="${secStr}">${secStr}</option>`;
            }
        } catch (e) {
            console.error("Error loading classes:", e);
            if(document.getElementById("myClassesContainer")) document.getElementById("myClassesContainer").innerHTML = "<p class='text-red-500'>Error loading classes.</p>";
        }
    }

    // ================= 3. RECENT SESSIONS WITH % (JS SORTED) =================
    async function loadRecentSessionsLog() {
        try {
            const container = document.getElementById("recentSessionsLog");
            if(!container) return;
            container.innerHTML = "";

            const q = query(collection(db, "attendance_sessions"), where("teacherId", "==", currentTeacherId));
            const snapshot = await getDocs(q);

            if(snapshot.empty) {
                container.innerHTML = "<p class='text-slate-500 text-sm'>No sessions conducted yet.</p>"; return;
            }

            let allSessions = [];
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                if(data.createdAt) allSessions.push({ id: docSnap.id, ...data, time: data.createdAt.toDate().getTime() });
            });
            allSessions.sort((a,b) => b.time - a.time);
            const topSessions = allSessions.slice(0, 6);

            for (const data of topSessions) {
                const dateStr = new Date(data.time).toLocaleString();
                
                const stQ = query(collection(db, "users"), where("role", "==", "student"), where("section", "==", (data.sectionId||"").toUpperCase()));
                const totalSt = (await getDocs(stQ)).size;
                
                const marksQ = query(collection(db, "attendance_marks"), where("sessionId", "==", data.id));
                const attCount = (await getDocs(marksQ)).size;
                
                let pct = totalSt > 0 ? Math.round((attCount/totalSt)*100) : 0;

                container.innerHTML += `
                    <div class="p-4 border border-slate-100 bg-slate-50 rounded-xl shadow-sm flex justify-between items-center mb-2">
                        <div>
                            <p class="font-bold text-slate-800 text-sm">${data.subject} <span class="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded ml-2">SEC ${data.sectionId}</span></p>
                            <p class="text-xs text-slate-500 mt-1"><i class="fa-solid fa-clock mr-1"></i> ${dateStr}</p>
                        </div>
                        <div class="text-right">
                            <p class="text-2xl font-black text-brand">${pct}%</p>
                            <p class="text-[9px] uppercase font-bold text-slate-400">Present (${attCount}/${totalSt})</p>
                        </div>
                    </div>
                `;
            }
        } catch(e) { console.error("Error loading session logs:", e); }
    }

    // ================= 4. LOAD MY STUDENTS (WITH OVERALL ATTENDANCE %) =================
    async function loadMyStudents() {
        try {
            const studentContainer = document.getElementById("myStudentsListContainer");
            if(!studentContainer) return;

            if(myAllocatedClasses.length === 0) {
                studentContainer.innerHTML = "<p class='text-slate-500 text-center py-10'>No sections allocated to you yet.</p>";
                return;
            }
            
            studentContainer.innerHTML = "<p class='text-slate-500 text-sm py-8'><i class='fa-solid fa-spinner fa-spin mr-2'></i> Fetching students and calculating attendance...</p>";

            const q = query(collection(db, "users"), where("role", "==", "student"));
            const snapshot = await getDocs(q);

            let filteredStudents = [];
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const sec = (data.section || "").trim().toUpperCase();
                if(myAllocatedClasses.includes(sec)) {
                    filteredStudents.push({ id: docSnap.id, ...data });
                }
            });

            if(filteredStudents.length === 0) {
                studentContainer.innerHTML = "<p class='text-slate-500 text-center py-10'>No students found in your allocated sections.</p>";
                return;
            }

            // PRE-CALCULATE OVERALL ATTENDANCE % FOR EACH STUDENT
            const sessQ = query(collection(db, "attendance_sessions"), where("teacherId", "==", currentTeacherId));
            const allSessionsSnap = await getDocs(sessQ);
            let sessionCountsBySection = {};
            allSessionsSnap.forEach(d => {
                const sec = (d.data().sectionId || "").toUpperCase();
                sessionCountsBySection[sec] = (sessionCountsBySection[sec] || 0) + 1;
            });

            for(let i=0; i<filteredStudents.length; i++) {
                const st = filteredStudents[i];
                const marksQ = query(collection(db, "attendance_marks"), where("studentId", "==", st.id));
                const marksSnap = await getDocs(marksQ);
                const totalSessions = sessionCountsBySection[(st.section||"").toUpperCase()] || 0;
                const attended = marksSnap.size;
                filteredStudents[i].attendancePct = totalSessions > 0 ? Math.round((attended/totalSessions)*100) : 0;
            }

            let html = `
            <div class="overflow-x-auto">
                <table class="w-full text-left min-w-[800px]">
                    <thead class="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 tracking-wider">
                        <tr>
                            <th class="px-6 md:px-8 py-5 font-bold">Student Details</th>
                            <th class="px-6 md:px-8 py-5 font-bold">Username</th>
                            <th class="px-6 md:px-8 py-5 font-bold">Section</th>
                            <th class="px-6 md:px-8 py-5 font-bold">Overall Att %</th>
                            <th class="px-6 md:px-8 py-5 font-bold text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">`;
            
            filteredStudents.forEach(data => {
                let pctColor = data.attendancePct >= 75 ? "text-emerald-600 bg-emerald-50 border-emerald-100" : (data.attendancePct >= 50 ? "text-orange-600 bg-orange-50 border-orange-100" : "text-red-600 bg-red-50 border-red-100");
                
                html += `
                    <tr class="hover:bg-slate-50/50 transition">
                        <td class="px-8 py-5">
                            <div class="flex items-center gap-4">
                                <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600"><i class="fa-solid fa-user-graduate"></i></div>
                                <div>
                                    <p class="font-bold text-slate-800">${data.name}</p>
                                    <p class="text-xs text-slate-500">${data.email}</p>
                                </div>
                            </div>
                        </td>
                        <td class="px-8 py-5 text-sm font-bold text-slate-600">${data.username || '-'}</td>
                        <td class="px-8 py-5">
                            <span class="px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-600">${data.section || 'Not Assigned'}</span>
                        </td>
                        <td class="px-8 py-5">
                            <span class="px-3 py-1.5 rounded-lg text-xs font-black uppercase border shadow-sm ${pctColor}">${data.attendancePct}%</span>
                        </td>
                        <td class="px-8 py-5 text-right">
                            <div class="flex justify-end gap-2">
                                <button class="bg-indigo-100 hover:bg-indigo-600 text-indigo-700 hover:text-white px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm" onclick="window.open('/student-dashboard?viewAs=${data.id}', '_blank')"><i class="fa-solid fa-chart-line mr-1"></i> Dashboard</button>
                                <button class="btn-quick-remark bg-orange-100 hover:bg-orange-500 text-orange-700 hover:text-white px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm" data-sid="${data.id}" data-sname="${data.name}"><i class="fa-solid fa-comment-dots mr-1"></i> Remark</button>
                            </div>
                        </td>
                    </tr>`;
            });
            html += `</tbody></table></div>`;
            studentContainer.innerHTML = html;

        } catch (e) { 
            console.error("Error loading students:", e); 
            if(document.getElementById("myStudentsListContainer")) {
                document.getElementById("myStudentsListContainer").innerHTML = "<p class='text-red-500 text-center py-10'>Error loading students.</p>";
            }
        }
    }

    // ================= 5. GLOBAL REMARK SYSTEM (CRASH-PROOF EVENT DELEGATION) =================
    // Use document.addEventListener to handle clicks on dynamically generated elements
    document.addEventListener("click", async (e) => {
        // 1. Quick Remark Button from Student Table
        if (e.target.closest(".btn-quick-remark")) {
            const btn = e.target.closest(".btn-quick-remark");
            const sid = btn.getAttribute("data-sid");
            const sname = btn.getAttribute("data-sname");
            
            const rModal = document.getElementById("globalRemarkModal");
            const rSelClass = document.getElementById("remarkSelClass");
            const rSelStudent = document.getElementById("remarkSelStudent");
            
            if (!isViewOnly && rModal) {
                if(rSelClass) rSelClass.innerHTML = `<option value="">Direct Selection</option>`;
                if(rSelStudent) rSelStudent.innerHTML = `<option value="${sid}">${sname}</option>`;
                rModal.classList.remove("hidden");
            }
        }

        // 2. Open Global Remark Modal from Header Button
        if (e.target.closest("#btnOpenGlobalRemark")) {
            const rModal = document.getElementById("globalRemarkModal");
            const rSelStudent = document.getElementById("remarkSelStudent");
            
            if (!isViewOnly && rModal) {
                if(rSelStudent) rSelStudent.innerHTML = '<option value="">Select Class First</option>';
                rModal.classList.remove("hidden");
            }
        }
        
        // 3. Close Global Remark Modal
        if (e.target.closest("#btnCloseGlobalRemark")) {
            const rModal = document.getElementById("globalRemarkModal");
            if (rModal) rModal.classList.add("hidden");
        }

        // 4. Submit Global Remark
        if (e.target.closest("#btnSubmitGlobalRemark")) {
            const submitBtn = e.target.closest("#btnSubmitGlobalRemark");
            const rSelStudent = document.getElementById("remarkSelStudent");
            const remarkTextEl = document.getElementById("remarkText");
            
            if(isViewOnly) return;

            const sid = rSelStudent ? rSelStudent.value : null;
            const text = remarkTextEl ? remarkTextEl.value.trim() : "";
            
            if(!sid || !text) {
                alert("Select student and type remark!");
                return;
            }

            submitBtn.innerHTML = "Sending..."; 
            submitBtn.disabled = true;

            try {
                await addDoc(collection(db, "remarks"), { 
                    studentId: sid, 
                    teacherId: currentTeacherId, 
                    remark: text, 
                    timestamp: serverTimestamp() 
                });
                alert("Remark sent successfully!");
                const rModal = document.getElementById("globalRemarkModal");
                if(rModal) rModal.classList.add("hidden"); 
                if(remarkTextEl) remarkTextEl.value = "";
            } catch(error) { 
                console.error(error);
                alert("Failed to send remark."); 
            } finally { 
                submitBtn.innerHTML = "Send Remark"; 
                submitBtn.disabled = false; 
            }
        }
    });

    // Event Delegation for "Change" events (Dropdowns)
    document.addEventListener("change", async (e) => {
        // Class Selection inside Remark Modal
        if (e.target.id === "remarkSelClass") {
            const sec = e.target.value;
            if(!sec) return;
            
            const rSelStudent = document.getElementById("remarkSelStudent");
            if(rSelStudent) rSelStudent.innerHTML = '<option value="">Fetching...</option>';
            
            try {
                const sq = query(collection(db, "users"), where("role", "==", "student"), where("section", "==", sec));
                const sSnap = await getDocs(sq);
                
                if(rSelStudent) {
                    rSelStudent.innerHTML = '<option value="">-- Choose Student --</option>';
                    sSnap.forEach(d => rSelStudent.innerHTML += `<option value="${d.id}">${d.data().name}</option>`);
                }
            } catch(error) {
                console.error("Error fetching students:", error);
            }
        }
    });

    // ================= 6. DYNAMIC QR LIVE SESSION LOGIC =================
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

    if(!isViewOnly && btnOpenSessionModal && sessionModal) {
        btnOpenSessionModal.addEventListener("click", () => sessionModal.classList.remove("hidden"));
        
        if(btnCloseSessionModal) {
            btnCloseSessionModal.addEventListener("click", () => sessionModal.classList.add("hidden"));
        }

        if(btnStartSession) {
            btnStartSession.addEventListener("click", async () => {
                const selMyClass = document.getElementById("selMyClass");
                const selectedValue = selMyClass ? selMyClass.value : null;
                if(!selectedValue) {
                    alert("Select a class first!");
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
                    if(qrDisplayModal) qrDisplayModal.classList.remove("hidden");
                    if(qrClassDisplay) qrClassDisplay.innerText = `${subjectName} (Sec: ${sectionId})`;
                    
                    startSessionLogic(initialToken);
                    
                } catch (error) {
                    console.error("Session Start Error:", error); 
                    alert("Error starting session");
                } finally {
                    btnStartSession.innerHTML = "Show QR Code";
                    btnStartSession.disabled = false;
                }
            });
        }
    }

    function startSessionLogic(initialToken) {
        let timeLeft = 300; 
        if(qrTimerDisplay) qrTimerDisplay.innerText = "05:00";
        drawQRCode(activeSessionId, initialToken);

        countdownInterval = setInterval(async () => {
            timeLeft--;
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            if(qrTimerDisplay) qrTimerDisplay.innerText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

            if (timeLeft <= 0) {
                endSession(); 
            }
        }, 1000);

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
        if(qrDisplayModal) qrDisplayModal.classList.add("hidden");
        
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
            if (confirm("Are you sure you want to close this QR and end the session early?")) {
                endSession();
            }
        });
    }

    // ================= 7. POST ASSIGNMENTS =================
    const assignModal = document.getElementById("assignModal");
    if(!isViewOnly && assignModal) {
        const btnOpenAssign = document.getElementById("btnOpenAssign");
        const btnCloseAssign = document.getElementById("btnCloseAssign");
        const btnSaveAssign = document.getElementById("btnSaveAssign");

        if(btnOpenAssign) btnOpenAssign.addEventListener("click", () => assignModal.classList.remove("hidden"));
        if(btnCloseAssign) btnCloseAssign.addEventListener("click", () => assignModal.classList.add("hidden"));

        if(btnSaveAssign) {
            btnSaveAssign.addEventListener("click", async () => {
                const assignSelClass = document.getElementById("assignSelClass");
                const assignTitle = document.getElementById("assignTitle");
                const assignDue = document.getElementById("assignDue");

                const selectedVal = assignSelClass ? assignSelClass.value : null;
                const title = assignTitle ? assignTitle.value.trim() : "";
                const dueDate = assignDue ? assignDue.value : "";

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
                    if(assignTitle) assignTitle.value = "";
                    if(assignDue) assignDue.value = "";
                    loadMyPostedAssignments();
                } catch (err) {
                    console.error(err); alert("Failed to post assignment.");
                }
            });
        }
    }

    // ================= 8. LOAD ASSIGNMENTS & SUBMISSIONS (SUBMITTED + PENDING) =================
    async function loadMyPostedAssignments() {
        try {
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
                
                // Added data-sec here to fetch all students of that section later
                container.innerHTML += `
                    <div class="flex justify-between items-center p-5 bg-white border border-slate-100 shadow-sm rounded-2xl hover:shadow-md transition mb-3">
                        <div>
                            <p class="font-bold text-slate-800">${data.title}</p>
                            <p class="text-[11px] font-bold text-slate-500 mt-1 uppercase">Sec: <span class="text-brand">${data.sectionId}</span> | Due: <span class="text-red-500">${formattedDate}</span></p>
                        </div>
                        <button class="btn-view-subs bg-brand/10 text-brand hover:bg-brand hover:text-white font-bold text-xs px-4 py-2.5 rounded-xl transition" data-id="${doc.id}" data-title="${data.title}" data-sec="${data.sectionId}">
                            View Submissions
                        </button>
                    </div>
                `;
            });
        } catch(e) { console.error("Error loading assignments:", e); }
    }

    const submissionsModal = document.getElementById("submissionsModal");
    const submissionsList = document.getElementById("submissionsList");

    if(document.getElementById("btnCloseSubmissions")) {
        document.getElementById("btnCloseSubmissions").addEventListener("click", () => {
            if(submissionsModal) submissionsModal.classList.add("hidden");
        });
    }

    const postedAssignmentsContainer = document.getElementById("postedAssignmentsContainer");
    if(postedAssignmentsContainer) {
        postedAssignmentsContainer.addEventListener("click", async (e) => {
            if(e.target.closest('.btn-view-subs')) {
                const btn = e.target.closest('.btn-view-subs');
                const assignmentId = btn.getAttribute("data-id");
                const sectionId = btn.getAttribute("data-sec").toUpperCase();
                
                if(document.getElementById("subModalTitle")) document.getElementById("subModalTitle").innerText = btn.getAttribute("data-title");
                if(submissionsModal) submissionsModal.classList.remove("hidden");
                if(submissionsList) submissionsList.innerHTML = "<p class='text-sm text-slate-500'><i class='fa-solid fa-spinner fa-spin mr-2'></i> Fetching submissions...</p>";

                try {
                    // 1. Fetch all students in this section
                    const stQ = query(collection(db, "users"), where("role", "==", "student"), where("section", "==", sectionId));
                    const stSnap = await getDocs(stQ);
                    let allClassStudents = [];
                    stSnap.forEach(d => allClassStudents.push({ id: d.id, ...d.data() }));

                    // 2. Fetch all submissions for this assignment
                    const subQ = query(collection(db, "assignment_submissions"), where("assignmentId", "==", assignmentId));
                    const subSnap = await getDocs(subQ);
                    
                    let submittedStudentIds = new Set();
                    let submissionsData = {};
                    
                    subSnap.forEach(d => {
                        const dat = d.data();
                        submittedStudentIds.add(dat.studentId);
                        submissionsData[dat.studentId] = { id: d.id, ...dat };
                    });

                    if(submissionsList) submissionsList.innerHTML = "";

                    let submittedHTML = `<h3 class="font-black text-emerald-600 mb-4 text-xs uppercase tracking-widest border-b border-emerald-100 pb-2">Submitted (${submittedStudentIds.size})</h3>`;
                    let pendingHTML = `<h3 class="font-black text-red-500 mb-4 mt-8 text-xs uppercase tracking-widest border-b border-red-100 pb-2">Pending (${allClassStudents.length - submittedStudentIds.size})</h3>`;

                    // 3. Build HTML separating Submitted and Pending
                    for(const student of allClassStudents) {
                        if(submittedStudentIds.has(student.id)) {
                            // STUDENT HAS SUBMITTED
                            const subData = submissionsData[student.id];
                            
                            const remarkActionHTML = isViewOnly ? 
                                `<p class="text-xs text-orange-500 font-bold mt-2"><i class="fa-solid fa-lock"></i> Remarks disabled in View Mode</p>` :
                                `<div class="flex gap-2 mt-4">
                                    <input type="text" id="remark-${subData.id}" placeholder="Give a remark or grade..." class="flex-1 text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-brand">
                                    <button class="btn-save-remark bg-brand text-white font-bold text-xs px-5 py-2 rounded-xl hover:bg-emerald-600 shadow-sm transition" data-subid="${subData.id}" data-studentid="${student.id}">
                                        Send Remark
                                    </button>
                                </div>`;

                            const fileHTML = subData.fileUrl ? 
                                `<div class="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-between">
                                    <span class="text-xs font-bold text-blue-700"><i class="fa-solid fa-paperclip mr-1"></i> File Attached</span>
                                    <a href="${subData.fileUrl}" target="_blank" class="text-xs bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg transition font-bold shadow-sm flex items-center gap-1"><i class="fa-solid fa-up-right-from-square"></i> Open File</a>
                                </div>` : '';

                            submittedHTML += `
                                <div class="p-5 border border-slate-100 rounded-2xl bg-white shadow-sm mb-3">
                                    <div class="flex justify-between items-center mb-3 border-b border-slate-50 pb-2">
                                        <p class="font-bold text-sm text-slate-800"><i class="fa-solid fa-user-graduate text-emerald-500 mr-2"></i>${student.name}</p>
                                        <span class="text-[10px] bg-emerald-50 text-emerald-600 font-bold px-2 py-1 rounded">Submitted</span>
                                    </div>
                                    <div class="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm text-slate-600 break-words shadow-inner">
                                        ${subData.answer || "<i class='text-slate-400'>No text response provided.</i>"}
                                    </div>
                                    ${fileHTML}
                                    ${remarkActionHTML}
                                </div>
                            `;
                        } else {
                            // STUDENT HAS NOT SUBMITTED YET (PENDING)
                            pendingHTML += `
                                <div class="p-4 border border-slate-100 rounded-2xl bg-slate-50 shadow-sm mb-3 flex justify-between items-center opacity-75 hover:opacity-100 transition">
                                    <div>
                                        <p class="font-bold text-sm text-slate-800"><i class="fa-solid fa-user-graduate text-slate-400 mr-2"></i>${student.name}</p>
                                        <p class="text-[10px] text-slate-500 uppercase font-bold mt-1">Pending Task Submission</p>
                                    </div>
                                    <span class="text-xs font-black text-red-500 bg-red-50 px-3 py-1 rounded-lg border border-red-100">Not Submitted</span>
                                </div>
                            `;
                        }
                    }

                    if(submissionsList) {
                        submissionsList.innerHTML = submittedHTML + pendingHTML;
                    }

                } catch(err) {
                    console.error("Error fetching submissions:", err);
                    if(submissionsList) submissionsList.innerHTML = "<p class='text-red-500 text-sm'>Error fetching submissions.</p>";
                }
            }
        });
    }

    // ================= 9. LOGOUT =================
    const btnLogout = document.getElementById("btnLogout");
    if(btnLogout) {
        btnLogout.addEventListener("click", () => {
            if(isViewOnly) window.close(); 
            else signOut(auth).then(() => window.location.replace("/login"));
        });
    }
});