import { auth, db } from "./firebase.js"; 
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, getDocs, addDoc, doc, getDoc, serverTimestamp, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const storage = getStorage();

document.addEventListener("DOMContentLoaded", () => {
    
    let currentStudentId = null;
    let currentStudentSection = null;
    let activeSessionId = null;
    let currentAssignmentIdToSubmit = null;
    let currentResubmitId = null;
    let attendanceChartInstance = null;
    let attendanceLineChartInstance = null;
    let subjectStatsGlobal = {};
    const urlParams = new URLSearchParams(window.location.search);
    const viewAsId = urlParams.get('viewAs');
    let isViewOnly = false;

    // ================= MOBILE MENU LOGIC =================
    const mobileMenuBtn = document.getElementById("mobileMenuBtn");
    const sidebar = document.getElementById("mainSidebar");
    const mobileOverlay = document.getElementById("mobileOverlay");

    function toggleMobileMenu() {
        if(sidebar && mobileOverlay) {
            sidebar.classList.toggle("-translate-x-full");
            mobileOverlay.classList.toggle("hidden");
        }
    }
    if (mobileMenuBtn && mobileOverlay) {
        mobileMenuBtn.addEventListener("click", toggleMobileMenu);
        mobileOverlay.addEventListener("click", toggleMobileMenu);
    }

    // ================= TAB SWITCHING & SMART ROUTING =================
    document.querySelectorAll(".nav-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const targetId = btn.getAttribute("data-target");
            
            document.querySelectorAll(".nav-btn").forEach(b => {
                b.classList.remove("bg-gradient-to-r", "from-blue-500", "to-indigo-600", "text-white", "shadow-md");
                b.classList.add("text-slate-400");
            });
            btn.classList.add("bg-gradient-to-r", "from-blue-500", "to-indigo-600", "text-white", "shadow-md");
            btn.classList.remove("text-slate-400");
            
            document.querySelectorAll(".tab-content").forEach(v => { 
                v.classList.remove("active"); v.classList.add("hidden"); 
            });
            const targetView = document.getElementById(targetId);
            if (targetView) { 
                targetView.classList.remove("hidden"); targetView.classList.add("active"); 
            }
            
            const scrollArea = document.getElementById('mainScrollArea');
            if (scrollArea) scrollArea.scrollTop = 0;
            
            if (window.innerWidth <= 1024 && !sidebar.classList.contains("-translate-x-full")) toggleMobileMenu();
            
            if (targetId !== "view-dashboard") history.pushState({ tab: targetId }, ""); else history.replaceState({ tab: targetId }, "");
        });
    });

    const requestedTab = urlParams.get('tab');
    if (requestedTab) {
        const tabBtn = document.querySelector(`.nav-btn[data-target="view-${requestedTab}"]`);
        if (tabBtn) {
            setTimeout(() => tabBtn.click(), 50);
        } else {
            history.replaceState({ tab: 'view-dashboard' }, "");
        }
    } else {
        history.replaceState({ tab: 'view-dashboard' }, "");
    }
    window.addEventListener("popstate", (e) => {
        const scrollArea = document.getElementById('mainScrollArea');
        if (scrollArea) scrollArea.scrollTop = 0;

        if (sidebar && !sidebar.classList.contains("-translate-x-full")) {
            toggleMobileMenu(); return;
        }

        if (e.state && e.state.tab) {
            document.querySelectorAll(".tab-content").forEach(v => { v.classList.remove("active"); v.classList.add("hidden"); });
            const targetView = document.getElementById(e.state.tab);
            if (targetView) { targetView.classList.remove("hidden"); targetView.classList.add("active"); }

            document.querySelectorAll(".nav-btn").forEach(b => {
                if(b.getAttribute('data-target') === e.state.tab) {
                    b.classList.add("bg-gradient-to-r", "from-blue-500", "to-indigo-600", "text-white", "shadow-md"); b.classList.remove("text-slate-400");
                } else {
                    b.classList.remove("bg-gradient-to-r", "from-blue-500", "to-indigo-600", "text-white", "shadow-md"); b.classList.add("text-slate-400");
                }
            });
        } else { window.location.replace("/"); }
    });

    // ================= AUTHENTICATE =================
    onAuthStateChanged(auth, async (user) => {
        if (!user) return window.location.replace("/login");

        try {
            const loggedInDoc = await getDoc(doc(db, "users", user.uid));
            const loggedInRole = loggedInDoc.exists() ? loggedInDoc.data().role : null;

            if (viewAsId) {
                if (loggedInRole === "admin" || loggedInRole === "teacher") {
                    isViewOnly = true; currentStudentId = viewAsId;
                    setupImpersonationUI(); await safeLoadStudentData(viewAsId);
                } else { alert("Unauthorized!"); window.location.replace("/login"); }
            } else {
                if (loggedInRole === "student") { currentStudentId = user.uid; await safeLoadStudentData(user.uid); } 
                else window.location.replace("/login");
            }
        } catch (e) {}
    });

    function setupImpersonationUI() {
        const header = document.querySelector("header");
        if (header) {
            header.insertAdjacentHTML('afterend', `<div class="bg-yellow-50 border-b border-yellow-200 text-yellow-700 text-center py-1.5 text-[10px] font-black tracking-widest z-50 uppercase"><i class="fa-solid fa-eye mr-1"></i> View Mode</div>`);
        }
    }

    async function safeLoadStudentData(targetUid) {
        try {
            const userDoc = await getDoc(doc(db, "users", targetUid));
            if (userDoc.exists()) {
                const data = userDoc.data(); const fullName = data.name || "Student";
                if(document.getElementById("welcomeText")) document.getElementById("welcomeText").innerText = fullName;
                currentStudentSection = data.section ? data.section.trim().toUpperCase() : "Unassigned";
                if(document.getElementById("studentSectionBadge")) document.getElementById("studentSectionBadge").innerText = `SEC: ${currentStudentSection}`;
                if(document.getElementById("currentDateDisplay")) document.getElementById("currentDateDisplay").innerText = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

                let initials = "S"; if (fullName.length > 0) initials = fullName[0].toUpperCase();
                if(document.getElementById("userAvatarInitials")) document.getElementById("userAvatarInitials").innerText = initials;
                if(document.getElementById("mobileAvatarInitials")) document.getElementById("mobileAvatarInitials").innerText = initials;
                
                setupEditableTarget();
                listenForLiveSession(); 
                await loadMyHistoryAndGraph(); 
                await loadMyAssignments(); 
                await loadMyRemarks(); 
                await loadMySubjects(); 
            }
        } catch (e) {}
    }

    // ================= LOAD SUBJECTS =================
    async function loadMySubjects() {
        const container = document.getElementById("mySubjectsContainer"); if (!container) return;
        if (currentStudentSection === "Unassigned") { container.innerHTML = "<p class='text-slate-500 text-xs font-medium'>Unassigned section.</p>"; return; }
        
        const snap = await getDocs(query(collection(db, "teacher_assignments"), where("sectionId", "==", currentStudentSection)));
        container.innerHTML = "";
        if (snap.empty) { container.innerHTML = "<p class='text-slate-500 text-xs font-medium'>No subjects allocated.</p>"; return; }

        for (const docSnap of snap.docs) {
            const data = docSnap.data();
            const tDoc = await getDoc(doc(db, "users", data.teacherId));
            const tName = tDoc.exists() ? tDoc.data().name : "Unknown";
            container.innerHTML += `
                <div class="flex items-center gap-4 p-4 border border-slate-100 bg-slate-50 rounded-2xl shadow-sm">
                    <div class="w-10 h-10 bg-blue-100 text-brand rounded-xl flex items-center justify-center"><i class="fa-solid fa-book-open"></i></div>
                    <div><p class="font-bold text-slate-800 text-sm">${data.subjectName}</p><p class="text-[10px] text-slate-500 uppercase font-bold mt-0.5">Prof. ${tName}</p></div>
                </div>`;
        }
    }

    // ================= LIVE SESSION =================
    function listenForLiveSession() {
        if (currentStudentSection === "Unassigned") return;
        const q = query(collection(db, "attendance_sessions"), where("sectionId", "==", currentStudentSection), where("isActive", "==", true));

        onSnapshot(q, (snapshot) => {
            const banner = document.getElementById("liveSessionBanner"); if (!banner) return;
            if (!snapshot.empty) {
                const data = snapshot.docs[0].data(); activeSessionId = snapshot.docs[0].id;
                if (document.getElementById("liveSubjectName")) document.getElementById("liveSubjectName").innerText = data.subject;
                if (isViewOnly && document.getElementById("btnMarkPresent")) document.getElementById("btnMarkPresent").classList.add("hidden");
                banner.classList.remove("hidden");
                setTimeout(() => { banner.classList.remove("scale-95", "opacity-0"); banner.classList.add("scale-100", "opacity-100"); }, 50);
            } else {
                activeSessionId = null; banner.classList.remove("scale-100", "opacity-100"); banner.classList.add("scale-95", "opacity-0");
                setTimeout(() => { banner.classList.add("hidden"); }, 500);
            }
        });
    }

    // ================= HISTORY, GRAPHS & NEW SUBJECT STATS =================
    async function loadMyHistoryAndGraph() {
        if (currentStudentSection === "Unassigned") return;
        try {
            const sessSnap = await getDocs(query(collection(db, "attendance_sessions"), where("sectionId", "==", currentStudentSection)));
            let allSessions = []; subjectStatsGlobal = {}; 
            
            sessSnap.forEach(doc => {
                const data = doc.data();
                if (data.createdAt) {
                    allSessions.push({ id: doc.id, ...data, time: data.createdAt.toDate().getTime() });
                    // Init subject stats
                    if(!subjectStatsGlobal[data.subject]) subjectStatsGlobal[data.subject] = { total: 0, attended: 0 };
                    subjectStatsGlobal[data.subject].total += 1;
                }
            });
            allSessions.sort((a,b) => a.time - b.time); const totalHeld = allSessions.length;

            const marksSnap = await getDocs(query(collection(db, "attendance_marks"), where("studentId", "==", currentStudentId)));
            const attendedSet = new Set(); let allMarks = [];
            
            marksSnap.forEach(doc => {
                const data = doc.data(); attendedSet.add(data.sessionId);
                if (data.timestamp) allMarks.push({ id: doc.id, ...data, time: data.timestamp.toDate().getTime() });
            });

            // Populate attended subject stats
            allSessions.forEach(sess => {
                if(attendedSet.has(sess.id) && subjectStatsGlobal[sess.subject]) {
                    subjectStatsGlobal[sess.subject].attended += 1;
                }
            });

            const classesAttended = attendedSet.size;
            let pct = totalHeld > 0 ? Math.round((classesAttended / totalHeld) * 100) : 0;

            if (document.getElementById("statTotalSessions")) document.getElementById("statTotalSessions").innerText = classesAttended;
            if (document.getElementById("statAttPercent")) document.getElementById("statAttPercent").innerText = `${pct}%`;
            if (document.getElementById("graphPercentage")) document.getElementById("graphPercentage").innerText = `${pct}%`;
            
            drawChart(classesAttended, totalHeld > classesAttended ? totalHeld - classesAttended : 0);

            // Trend Graph
            let labels = []; let trendData = []; let runTotal = 0; let runAttended = 0;
            if (allSessions.length === 0) { drawLineChart(['No Data'], [0]); } 
            else {
                allSessions.forEach(s => {
                    runTotal++; if (attendedSet.has(s.id)) runAttended++;
                    let d = new Date(s.time); labels.push(`${d.getDate()}/${d.getMonth()+1}`); trendData.push(Math.round((runAttended / runTotal) * 100));
                });
                if (labels.length > 10) { labels = labels.slice(-10); trendData = trendData.slice(-10); }
                drawLineChart(labels, trendData);
            }

            // Logs
            const c1 = document.getElementById("recentActivityContainer");
            if(c1) {
                c1.innerHTML = "";
                if (allMarks.length === 0) c1.innerHTML = "<p class='text-slate-500 text-xs font-medium'>No history.</p>";
                else {
                    allMarks.sort((a,b) => b.time - a.time);
                    allMarks.slice(0, 10).forEach(data => {
                        c1.innerHTML += `
                            <div class="flex justify-between items-center p-4 border border-slate-100 bg-white rounded-2xl mb-3 shadow-sm hover:shadow transition-shadow">
                                <div class="flex items-center gap-3">
                                    <div class="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-xs"><i class="fa-solid fa-check"></i></div>
                                    <div><p class="font-bold text-sm text-slate-800">${data.subject || 'Lecture'}</p><p class="text-[9px] text-slate-400 font-bold tracking-widest uppercase">${new Date(data.time).toLocaleString()}</p></div>
                                </div>
                                <span class="text-[9px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded border border-emerald-100 tracking-wider">PRESENT</span>
                            </div>`;
                    });
                }
            }
        } catch (e) {}
    }

    function drawChart(attended, missed) {
        const ctx = document.getElementById('attendanceChart'); if (!ctx) return;
        if (attendanceChartInstance) attendanceChartInstance.destroy(); 
        const dataVals = (attended === 0 && missed === 0) ? [1] : [attended, missed];
        const bgColors = (attended === 0 && missed === 0) ? ['#f1f5f9'] : ['#4361ee', '#f1f5f9'];
        attendanceChartInstance = new Chart(ctx.getContext('2d'), {
            type: 'doughnut', data: { labels: ['Present', 'Absent'], datasets: [{ data: dataVals, backgroundColor: bgColors, borderWidth: 0, hoverOffset: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false }, tooltip: { enabled: (attended !== 0 || missed !== 0) } } }
        });
    }

    function drawLineChart(labels, data) {
        const ctx = document.getElementById('attendanceLineChart'); if (!ctx) return;
        if (attendanceLineChartInstance) attendanceLineChartInstance.destroy();
        attendanceLineChartInstance = new Chart(ctx.getContext('2d'), {
            type: 'line', data: { labels: labels, datasets: [{ label: 'Rate', data: data, borderColor: '#4361ee', backgroundColor: 'rgba(67, 97, 238, 0.1)', fill: true, tension: 0.4, borderWidth: 3, pointBackgroundColor: '#fff', pointBorderColor: '#4361ee', pointRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 } } }
        });
    }

    function setupEditableTarget() {
        const tgt = document.getElementById("targetTextContainer"); if (!tgt) return;
        const txt = document.getElementById("targetText");
        const saved = localStorage.getItem(`target_${currentStudentId}`) || 75;
        txt.innerText = saved + "%";
        tgt.addEventListener("click", () => {
            let n = prompt("Set Target % (0-100):", saved);
            if (n !== null && !isNaN(n) && n >= 0 && n <= 100) { localStorage.setItem(`target_${currentStudentId}`, n); txt.innerText = n + "%"; }
        });
    }

    // ================= 5. LOAD ASSIGNMENTS (WITH RESUBMIT FLOW) =================
    async function loadMyAssignments() {
        const container = document.getElementById("myAssignmentsContainer"); if (!container) return;
        if (currentStudentSection === "Unassigned") { container.innerHTML = "<p class='text-slate-500 text-xs italic'>No assignments.</p>"; return; }

        try {
            const snap = await getDocs(query(collection(db, "assignments"), where("sectionId", "==", currentStudentSection)));
            container.innerHTML = ""; let act = 0;
            if (snap.empty) { if (document.getElementById("statAssignments")) document.getElementById("statAssignments").innerText = "0"; container.innerHTML = "<p class='text-slate-500 text-xs italic'>All caught up.</p>"; return; }

            for (const docSnap of snap.docs) {
                const data = docSnap.data(); const fDate = new Date(data.dueDate).toLocaleDateString('en-US',{month:'short', day:'numeric'});
                const subSnap = await getDocs(query(collection(db, "assignment_submissions"), where("assignmentId", "==", docSnap.id), where("studentId", "==", currentStudentId)));
                const isSub = !subSnap.empty;
                
                let btnHTML = ""; let fback = ""; let isRejected = false;

                if (!isSub) {
                    act++;
                    btnHTML = isViewOnly ? `<span class="text-[10px] font-bold text-slate-400 border border-slate-200 px-3 py-1 rounded">Not Submitted</span>` 
                    : `<button class="btn-submit-task bg-slate-800 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md hover:bg-slate-900 transition-colors w-full sm:w-auto" data-id="${docSnap.id}" data-title="${data.title}">Submit Task</button>`;
                } else {
                    const subData = subSnap.docs[0].data(); const stat = subData.status || 'pending_review';
                    if (stat === 'approved') {
                        btnHTML = `<div class="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl text-xs font-bold border border-emerald-200 text-center w-full sm:w-auto"><i class="fa-solid fa-check-double mr-1"></i> Approved</div>`;
                        fback = `<div class="mt-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100"><p class="text-[10px] text-emerald-700 font-bold uppercase tracking-widest mb-1">Teacher Feedback</p><p class="text-xs text-emerald-800 font-medium">"${subData.teacherRemark || 'Great work!'}"</p></div>`;
                    } else if (stat === 'rejected') {
                        act++; isRejected = true;
                        // 🔥 RESUBMIT BUTTON LOGIC 🔥
                        btnHTML = isViewOnly ? `<div class="bg-red-50 text-red-600 px-4 py-2 rounded-xl text-xs font-bold border border-red-200 text-center w-full sm:w-auto"><i class="fa-solid fa-xmark mr-1"></i> Rejected</div>`
                        : `<button class="btn-resubmit-task bg-red-500 text-white px-5 py-2.5 rounded-xl text-xs font-black shadow-md hover:bg-red-600 transition-colors w-full sm:w-auto animate-pulse" data-id="${docSnap.id}" data-subid="${subSnap.docs[0].id}" data-title="${data.title}"><i class="fa-solid fa-rotate-right mr-1"></i> Resubmit Task</button>`;
                        fback = `<div class="mt-3 p-3 bg-red-50 rounded-xl border border-red-100"><p class="text-[10px] text-red-700 font-bold uppercase tracking-widest mb-1">Rejection Reason</p><p class="text-xs text-red-800 font-medium">"${subData.teacherRemark || 'Review and resubmit'}"</p></div>`;
                    } else {
                        btnHTML = `<div class="bg-amber-50 text-amber-600 px-4 py-2 rounded-xl text-xs font-bold border border-amber-200 text-center w-full sm:w-auto"><i class="fa-solid fa-clock mr-1"></i> Under Review</div>`;
                    }
                }

                container.innerHTML += `
                    <div class="p-5 lg:p-6 ${isSub && !isRejected ? 'bg-slate-50 border-slate-200' : (isRejected ? 'bg-red-50/30 border-red-200' : 'bg-white border-slate-200')} rounded-3xl border shadow-sm flex flex-col justify-between transition-all hover:shadow-md">
                        <div>
                            <div class="flex justify-between items-start mb-4">
                                <div class="${isSub && !isRejected ? 'bg-slate-200 text-slate-500' : 'bg-blue-50 text-brand'} w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0"><i class="fa-solid fa-file-pen"></i></div>
                                <span class="text-[9px] font-black text-red-500 bg-red-50 px-2 py-1 rounded border border-red-100 uppercase tracking-widest shrink-0">DUE: ${fDate}</span>
                            </div>
                            <p class="font-black text-lg ${isSub && !isRejected ? 'text-slate-500 line-through' : 'text-slate-800'} leading-tight mb-1">${data.title}</p>
                            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">${data.subjectName}</p>
                            ${fback}
                        </div>
                        <div class="flex justify-end mt-5 pt-5 border-t border-slate-100">
                            ${btnHTML}
                        </div>
                    </div>`;
            }
            if (document.getElementById("statAssignments")) document.getElementById("statAssignments").innerText = act;
        } catch (e) {}
    }

    // ================= 6. FETCH GENERAL REMARKS ONLY =================
    async function loadMyRemarks() {
        const container = document.getElementById("myRemarksContainer"); if (!container) return;
        try {
            const snap = await getDocs(query(collection(db, "remarks"), where("studentId", "==", currentStudentId)));
            container.innerHTML = "";
            if (snap.empty) { container.innerHTML = "<p class='text-slate-400 text-xs font-medium italic p-2'>No general remarks yet.</p>"; return; }

            for (const docSnap of snap.docs) {
                const data = docSnap.data();
                const tDoc = await getDoc(doc(db, "users", data.teacherId)); const tName = tDoc.exists() ? tDoc.data().name : "A Teacher";
                container.innerHTML += `
                    <div class="p-4 border-l-4 border-brand bg-white rounded-r-2xl mb-3 shadow-sm border border-y-slate-100 border-r-slate-100 hover:shadow transition-shadow">
                        <p class="text-sm font-medium text-slate-700 italic">"${data.remark}"</p>
                        <p class="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-3">From: Prof. ${tName}</p>
                    </div>`;
            }
        } catch (e) {}
    }

    // ================= 7. GLOBAL EVENT DELEGATION =================
    document.addEventListener("click", async (e) => {
        
        // JUMP TABS
        if (e.target.closest('.btn-jump-attendance')) { e.preventDefault(); document.querySelector('[data-target="view-attendance"]')?.click(); }
        if (e.target.closest('.btn-jump-assignments')) { e.preventDefault(); document.querySelector('[data-target="view-assignments"]')?.click(); }

        if (e.target.closest('#btnOpenSubjAtt')) {
            e.preventDefault();
            const modal = document.getElementById("subjectAttendanceModal");
            const list = document.getElementById("subjectAttendanceList");
            if(modal && list) {
                modal.classList.remove("hidden");
                list.innerHTML = "";
                
                if(Object.keys(subjectStatsGlobal).length === 0) {
                    list.innerHTML = "<p class='text-xs text-slate-400 text-center italic py-4'>No lectures conducted yet.</p>";
                } else {
                    for(const [subj, stat] of Object.entries(subjectStatsGlobal)) {
                        const pct = Math.round((stat.attended / stat.total) * 100);
                        let col = pct >= 75 ? "text-emerald-600 bg-emerald-50 border-emerald-100" : (pct >= 50 ? "text-orange-600 bg-orange-50 border-orange-100" : "text-red-600 bg-red-50 border-red-100");
                        
                        list.innerHTML += `
                            <div class="flex justify-between items-center p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
                                <div>
                                    <p class="font-black text-sm text-slate-800">${subj}</p>
                                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Attended: ${stat.attended} / ${stat.total}</p>
                                </div>
                                <span class="text-lg font-black px-3 py-1 rounded-xl border ${col}">${pct}%</span>
                            </div>`;
                    }
                }
            }
        }
        if (e.target.closest('#btnCloseSubjAtt')) { e.preventDefault(); document.getElementById("subjectAttendanceModal").classList.add("hidden"); }

        // MARK PRESENT
        if (!isViewOnly && e.target.closest('#btnMarkPresent')) {
            e.preventDefault(); const btn = e.target.closest('#btnMarkPresent'); if (!activeSessionId) return;
            btn.disabled = true; btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Wait...`;
            try {
                const checkSnap = await getDocs(query(collection(db, "attendance_marks"), where("sessionId", "==", activeSessionId), where("studentId", "==", currentStudentId)));
                if (!checkSnap.empty) { alert("Already marked!"); btn.innerHTML = `Done`; return; }
                await addDoc(collection(db, "attendance_marks"), { sessionId: activeSessionId, studentId: currentStudentId, sectionId: currentStudentSection, timestamp: serverTimestamp(), status: "Present" });
                btn.classList.replace("text-blue-600", "text-emerald-500"); btn.innerHTML = `<i class="fa-solid fa-check mr-2"></i> Marked`;
                loadMyHistoryAndGraph(); 
            } catch (err) { btn.disabled = false; btn.innerHTML = `Retry`; }
        }

        // OPEN SUBMIT/RESUBMIT MODAL
        if (!isViewOnly && (e.target.closest('.btn-submit-task') || e.target.closest('.btn-resubmit-task'))) {
            e.preventDefault();
            const btn = e.target.closest('.btn-submit-task') || e.target.closest('.btn-resubmit-task');
            
            // Set IDs
            currentAssignmentIdToSubmit = btn.getAttribute("data-id");
            currentResubmitId = btn.getAttribute("data-subid") || null; // Will be null for new submissions
            
            const isResubmitting = currentResubmitId !== null;
            
            if (document.getElementById("submitTaskTitle")) document.getElementById("submitTaskTitle").innerText = btn.getAttribute("data-title");
            if (document.getElementById("submitModalMainTitle")) document.getElementById("submitModalMainTitle").innerText = isResubmitting ? "Resubmit Task" : "Submit Task";
            if (document.getElementById("btnConfirmSubmit")) document.getElementById("btnConfirmSubmit").innerHTML = isResubmitting ? "Resubmit Work" : "Submit Work";
            
            document.getElementById("submitModal")?.classList.remove("hidden");
        }

        // CLOSE SUBMIT MODAL
        if (e.target.closest('#btnCloseSubmit')) {
            e.preventDefault(); document.getElementById("submitModal")?.classList.add("hidden");
            if (document.getElementById("submitAnswer")) document.getElementById("submitAnswer").value = "";
            if (document.getElementById("submitFile")) document.getElementById("submitFile").value = "";
            currentResubmitId = null; // Reset
        }

        // CONFIRM SUBMIT / RESUBMIT TO FIRESTORE
        if (!isViewOnly && e.target.closest('#btnConfirmSubmit')) {
            e.preventDefault();
            const ansEl = document.getElementById("submitAnswer"); const ans = ansEl ? ansEl.value.trim() : "";
            const fileInp = document.getElementById("submitFile"); const file = fileInp ? fileInp.files[0] : null;

            if (!ans && !file) return alert("Provide an answer or attach a file!");
            const btn = document.getElementById("btnConfirmSubmit"); btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Uploading...`; btn.disabled = true;

            try {
                let fileUrl = "";
                if (file) {
                    const fileRef = ref(storage, `assignments/${currentStudentId}/${Date.now()}_${file.name}`);
                    await uploadBytes(fileRef, file); fileUrl = await getDownloadURL(fileRef); 
                }

                if (currentResubmitId) {
                    // Update existing submission
                    let updateData = { answer: ans, status: "pending_review", submittedAt: serverTimestamp() };
                    if (fileUrl) updateData.fileUrl = fileUrl; // Only overwrite file if new one provided
                    
                    await updateDoc(doc(db, "assignment_submissions", currentResubmitId), updateData);
                } else {
                    // Create new submission
                    await addDoc(collection(db, "assignment_submissions"), {
                        assignmentId: currentAssignmentIdToSubmit, studentId: currentStudentId, sectionId: currentStudentSection, 
                        answer: ans, fileUrl: fileUrl, status: "pending_review", submittedAt: serverTimestamp()
                    });
                }

                document.getElementById("submitModal")?.classList.add("hidden");
                if (ansEl) ansEl.value = ""; if (fileInp) fileInp.value = "";
                currentResubmitId = null; // Reset
                loadMyAssignments(); 
            } catch (err) { btn.disabled = false; btn.innerHTML = "Retry"; }
        }

        // LOGOUT
        if (e.target.closest('#btnLogout')) {
            e.preventDefault(); if (isViewOnly) window.close(); else signOut(auth).then(() => window.location.replace("/login"));
        }
    });
});