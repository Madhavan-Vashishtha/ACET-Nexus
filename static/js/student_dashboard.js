import { auth, db } from "./firebase.js"; 
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, getDocs, addDoc, doc, getDoc, serverTimestamp, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
// 🔥 FIX: Direct Storage Import to prevent blank screen crash
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const storage = getStorage();

document.addEventListener("DOMContentLoaded", () => {
    
    let currentStudentId = null;
    let currentStudentSection = null;
    let activeSessionId = null;
    let currentAssignmentIdToSubmit = null;
    let attendanceChartInstance = null;
    let attendanceLineChartInstance = null;

    const urlParams = new URLSearchParams(window.location.search);
    const viewAsId = urlParams.get('viewAs');
    let isViewOnly = false;

    // ================= 0. TAB SWITCHING LOGIC =================
    const navBtns = document.querySelectorAll(".nav-btn");
    const views = document.querySelectorAll(".tab-content");
    const defaultTabId = "view-dashboard";

    navBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const activeTab = document.querySelector('.tab-content.active');
            const activeTabId = activeTab ? activeTab.id : defaultTabId;
            const targetId = btn.getAttribute("data-target");

            if (activeTabId === targetId) {
                return;
            }

            navBtns.forEach(b => {
                b.classList.remove("bg-brand", "text-white", "shadow-[0_4px_15px_rgba(67,97,238,0.4)]");
                b.classList.add("text-slate-400", "hover:bg-darkHover", "hover:text-white");
            });

            views.forEach(v => {
                v.classList.remove("active");
                v.style.display = "none";
            });

            btn.classList.add("bg-brand", "text-white", "shadow-[0_4px_15px_rgba(67,97,238,0.4)]");
            btn.classList.remove("text-slate-400", "hover:bg-darkHover", "hover:text-white");
            
            const targetView = document.getElementById(targetId);
            if (targetView) {
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

    // ================= 1. AUTHENTICATE & ISOLATED LOAD =================
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.replace("/login");
            return;
        }

        try {
            const loggedInDoc = await getDoc(doc(db, "users", user.uid));
            const loggedInRole = loggedInDoc.exists() ? loggedInDoc.data().role : null;

            if (viewAsId) {
                if (loggedInRole === "admin" || loggedInRole === "teacher") {
                    isViewOnly = true;
                    currentStudentId = viewAsId;
                    setupImpersonationUI();
                    await safeLoadStudentData(viewAsId);
                } else {
                    alert("Unauthorized Access!");
                    window.location.replace("/login");
                }
            } else {
                if (loggedInRole === "student") {
                    currentStudentId = user.uid;
                    await safeLoadStudentData(user.uid);
                } else {
                    window.location.replace("/login");
                }
            }
        } catch (authErr) {
            console.error("Auth Load Error:", authErr);
        }
    });

    function setupImpersonationUI() {
        const header = document.querySelector("header");
        if (header) {
            header.insertAdjacentHTML('afterend', `
                <div class="bg-yellow-100 border-b border-yellow-200 text-yellow-800 text-center py-2 text-xs font-bold tracking-widest z-50 shadow-sm">
                    <i class="fa-solid fa-eye mr-2"></i> VIEW ONLY MODE (ADMIN/TEACHER)
                </div>
            `);
        }
    }

    async function safeLoadStudentData(targetUid) {
        try {
            const userDoc = await getDoc(doc(db, "users", targetUid));
            
            if (userDoc.exists()) {
                const data = userDoc.data();
                const fullName = data.name || "Student";
                
                if (document.getElementById("welcomeText")) {
                    document.getElementById("welcomeText").innerText = `${fullName} ${isViewOnly ? '(View Mode)' : ''}`;
                }
                
                currentStudentSection = data.section ? data.section.trim().toUpperCase() : "Unassigned";
                
                if (document.getElementById("studentSectionBadge")) {
                    document.getElementById("studentSectionBadge").innerText = `SEC: ${currentStudentSection}`;
                }
                
                if (document.getElementById("currentDateDisplay")) {
                    document.getElementById("currentDateDisplay").innerText = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
                }

                const nameParts = fullName.trim().split(/\s+/);
                let initials = "U";
                
                if (nameParts.length === 1) {
                    initials = nameParts[0][0].toUpperCase();
                } else if (nameParts.length >= 2) {
                    initials = (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
                }
                
                if (document.getElementById("userAvatarInitials")) {
                    document.getElementById("userAvatarInitials").innerText = initials;
                }
                
                setupEditableTarget();

                try { 
                    listenForLiveSession(); 
                } catch(e) { 
                    console.error("Live Session Error:", e); 
                }

                try { 
                    await loadMyHistoryAndGraph(); 
                } catch(e) { 
                    console.error("History/Graph Error:", e); 
                }

                try { 
                    await loadMyAssignments(); 
                } catch(e) { 
                    console.error("Assignments Error:", e); 
                }

                try { 
                    await loadMyRemarks(); 
                } catch(e) { 
                    console.error("Remarks Error:", e); 
                }

                try { 
                    await loadMySubjects(); 
                } catch(e) { 
                    console.error("Subjects Error:", e); 
                }
            } else {
                console.error("User Document does not exist in Firestore.");
            }
        } catch (error) {
            console.error("Critical User Load Error:", error);
        }
    }

    // ================= 2. LOAD SUBJECTS =================
    async function loadMySubjects() {
        const container = document.getElementById("mySubjectsContainer");
        if (!container) {
            return;
        }

        if (currentStudentSection === "Unassigned") {
            container.innerHTML = "<p class='text-slate-500 text-sm'>You are not assigned to a section yet. Update your profile.</p>";
            return;
        }

        const q = query(collection(db, "teacher_assignments"), where("sectionId", "==", currentStudentSection));
        const snapshot = await getDocs(q);
        
        container.innerHTML = "";

        if (snapshot.empty) {
            container.innerHTML = "<p class='text-slate-500 text-sm'>No subjects allocated to your section yet.</p>";
            return;
        }

        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const teacherDoc = await getDoc(doc(db, "users", data.teacherId));
            const teacherName = teacherDoc.exists() ? teacherDoc.data().name : "Unknown";

            container.innerHTML += `
                <div class="flex items-center gap-4 p-3 border border-slate-100 bg-slate-50 rounded-xl shadow-sm hover:shadow transition">
                    <div class="w-10 h-10 bg-blue-100 text-brand rounded-lg flex items-center justify-center font-bold">
                        <i class="fa-solid fa-book-open"></i>
                    </div>
                    <div>
                        <p class="font-bold text-slate-800 text-sm">${data.subjectName}</p>
                        <p class="text-[11px] text-slate-500 uppercase font-bold mt-0.5">Prof. ${teacherName}</p>
                    </div>
                </div>
            `;
        }
    }

    // ================= 3. LIVE SESSION LISTENER =================
    function listenForLiveSession() {
        if (currentStudentSection === "Unassigned") {
            return;
        }
        
        const sessionQuery = query(collection(db, "attendance_sessions"), where("sectionId", "==", currentStudentSection), where("isActive", "==", true));

        onSnapshot(sessionQuery, (snapshot) => {
            const banner = document.getElementById("liveSessionBanner");
            if (!banner) {
                return;
            }

            if (!snapshot.empty) {
                const sessionData = snapshot.docs[0].data();
                activeSessionId = snapshot.docs[0].id;
                
                const liveSubText = document.getElementById("liveSubjectName");
                if (liveSubText) {
                    liveSubText.innerText = sessionData.subject;
                }
                
                const markBtn = document.getElementById("btnMarkPresent");
                if (isViewOnly && markBtn) {
                    markBtn.classList.add("hidden");
                }
                
                banner.classList.remove("hidden");
                setTimeout(() => {
                    banner.classList.remove("scale-95", "opacity-0");
                    banner.classList.add("scale-100", "opacity-100");
                }, 50);
            } else {
                activeSessionId = null;
                banner.classList.remove("scale-100", "opacity-100");
                banner.classList.add("scale-95", "opacity-0");
                setTimeout(() => { 
                    banner.classList.add("hidden"); 
                }, 500);
            }
        });
    }

    // ================= 4. HISTORY, GRAPHS & LOGS (JS SORTED) =================
    async function loadMyHistoryAndGraph() {
        if (currentStudentSection === "Unassigned") {
            return;
        }

        try {
            // Fetch All sessions WITHOUT orderBy to avoid Firebase Composite Index error
            const sessQ = query(collection(db, "attendance_sessions"), where("sectionId", "==", currentStudentSection));
            const sessSnap = await getDocs(sessQ);
            
            let allSessions = [];
            sessSnap.forEach(doc => {
                const data = doc.data();
                if (data.createdAt) {
                    allSessions.push({ id: doc.id, ...data, time: data.createdAt.toDate().getTime() });
                }
            });
            
            // Sort Ascending Locally for the graph trend to go left-to-right properly
            allSessions.sort((a,b) => a.time - b.time);
            const totalHeld = allSessions.length;

            // Fetch My Attended Classes
            const marksQ = query(collection(db, "attendance_marks"), where("studentId", "==", currentStudentId));
            const marksSnap = await getDocs(marksQ);
            
            const attendedSet = new Set();
            let allMarks = [];
            
            marksSnap.forEach(doc => {
                const data = doc.data();
                attendedSet.add(data.sessionId);
                if (data.timestamp) {
                    allMarks.push({ id: doc.id, ...data, time: data.timestamp.toDate().getTime() });
                }
            });

            const classesAttended = attendedSet.size;
            let percentage = totalHeld > 0 ? Math.round((classesAttended / totalHeld) * 100) : 0;
            let missedClasses = totalHeld > classesAttended ? totalHeld - classesAttended : 0;

            if (document.getElementById("statTotalSessions")) {
                document.getElementById("statTotalSessions").innerText = classesAttended; // Lectures Attended
            }
            if (document.getElementById("statAttPercent")) {
                document.getElementById("statAttPercent").innerText = `${percentage}%`;
            }
            if (document.getElementById("graphPercentage")) {
                document.getElementById("graphPercentage").innerText = `${percentage}%`;
            }
            
            drawChart(classesAttended, missedClasses);

            // 🔥 CALCULATE REAL CUMULATIVE GRAPH TREND 🔥
            let labels = [];
            let trendData = [];
            let runTotal = 0;
            let runAttended = 0;

            if (allSessions.length === 0) {
                drawLineChart(['No Data'], [0]); 
            } else {
                allSessions.forEach(sessData => {
                    runTotal++;
                    
                    if (attendedSet.has(sessData.id)) {
                        runAttended++;
                    }
                    
                    let pct = Math.round((runAttended / runTotal) * 100);
                    let d = new Date(sessData.time);
                    
                    labels.push(`${d.getDate()}/${d.getMonth()+1}`);
                    trendData.push(pct);
                });

                // Limit chart to last 10 data points
                if (labels.length > 10) {
                    labels = labels.slice(-10);
                    trendData = trendData.slice(-10);
                }
                
                drawLineChart(labels, trendData);
            }

            // Render Recent Logs (Sorted Descending locally)
            const container1 = document.getElementById("recentActivityContainer");
            const container2 = document.getElementById("myHistoryContainer");
            
            const renderLogs = (container) => {
                if (!container) {
                    return;
                }
                
                container.innerHTML = "";
                
                if (allMarks.length === 0) {
                    container.innerHTML = "<p class='text-slate-500 text-sm p-4'>No attendance history found.</p>";
                } else {
                    allMarks.sort((a,b) => b.time - a.time); // Newest first
                    const topMarks = allMarks.slice(0, 10);
                    
                    topMarks.forEach(data => {
                        const dateStr = new Date(data.time).toLocaleString();
                        container.innerHTML += `
                            <div class="flex justify-between items-center p-4 border border-slate-100 bg-white rounded-xl mb-3 shadow-sm hover:shadow-md transition">
                                <div class="flex items-center gap-4">
                                    <div class="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600"><i class="fa-solid fa-check"></i></div>
                                    <div>
                                        <p class="font-bold text-slate-800">${data.subject || 'Lecture Session'}</p>
                                        <p class="text-xs text-slate-500">${dateStr}</p>
                                    </div>
                                </div>
                                <span class="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-100">PRESENT</span>
                            </div>
                        `;
                    });
                }
            };

            renderLogs(container1);
            renderLogs(container2);

        } catch (error) {
            console.error("Error loading history & graphs:", error);
        }
    }

    function drawChart(attended, missed) {
        const ctx = document.getElementById('attendanceChart');
        if (!ctx) {
            return;
        }

        if (attendanceChartInstance) {
            attendanceChartInstance.destroy(); 
        }
        
        const dataVals = (attended === 0 && missed === 0) ? [1] : [attended, missed];
        const bgColors = (attended === 0 && missed === 0) ? ['#e2e8f0'] : ['#4361ee', '#e2e8f0'];

        attendanceChartInstance = new Chart(ctx.getContext('2d'), {
            type: 'doughnut',
            data: { 
                labels: ['Present', 'Absent'], 
                datasets: [{ 
                    data: dataVals, 
                    backgroundColor: bgColors, 
                    borderWidth: 0, 
                    hoverOffset: 4 
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                cutout: '75%', 
                plugins: { 
                    legend: { display: false }, 
                    tooltip: { enabled: (attended !== 0 || missed !== 0) } 
                } 
            }
        });
    }

    function drawLineChart(labels, data) {
        const ctx = document.getElementById('attendanceLineChart');
        if (!ctx) {
            return;
        }

        if (attendanceLineChartInstance) {
            attendanceLineChartInstance.destroy();
        }
        
        attendanceLineChartInstance = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Cumulative Attendance Rate',
                    data: data,
                    borderColor: '#4361ee',
                    backgroundColor: 'rgba(67, 97, 238, 0.1)',
                    fill: true, 
                    tension: 0.4, 
                    borderWidth: 3, 
                    pointBackgroundColor: '#fff', 
                    pointBorderColor: '#4361ee', 
                    pointRadius: 4
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { legend: { display: false } }, 
                scales: { y: { beginAtZero: true, max: 100 } } 
            }
        });
    }

    function setupEditableTarget() {
        const targetText = document.getElementById("targetText"); 
        if (!targetText) {
            return;
        }
        
        const savedTarget = localStorage.getItem(`target_${currentStudentId}`) || 75;
        targetText.innerText = savedTarget + "%";

        targetText.parentElement.style.cursor = "pointer";
        targetText.parentElement.title = "Click to Edit Target";
        
        targetText.parentElement.addEventListener("click", () => {
            let newTarget = prompt("Set your target attendance percentage (0-100):", savedTarget);
            if (newTarget !== null && !isNaN(newTarget) && newTarget >= 0 && newTarget <= 100) {
                localStorage.setItem(`target_${currentStudentId}`, newTarget);
                targetText.innerText = newTarget + "%";
            }
        });
    }

    // ================= 5. LOAD ASSIGNMENTS (WITH NEW APPROVAL LOGIC) =================
    async function loadMyAssignments() {
        const container = document.getElementById("myAssignmentsContainer");
        if (!container) {
            return;
        }

        if (currentStudentSection === "Unassigned") {
            container.innerHTML = "<p class='text-slate-500 text-sm col-span-2'>No pending assignments right now.</p>";
            return;
        }

        try {
            const q = query(collection(db, "assignments"), where("sectionId", "==", currentStudentSection));
            const snapshot = await getDocs(q);
            
            container.innerHTML = "";
            let activeAssignmentsCount = 0;

            if (snapshot.empty) {
                if (document.getElementById("statAssignments")) {
                    document.getElementById("statAssignments").innerText = "0";
                }
                container.innerHTML = "<p class='text-slate-500 text-sm col-span-2'>No pending assignments right now.</p>";
                return;
            }

            for (const docSnap of snapshot.docs) {
                const data = docSnap.data();
                const formattedDate = new Date(data.dueDate).toLocaleDateString();

                const subQ = query(collection(db, "assignment_submissions"), where("assignmentId", "==", docSnap.id), where("studentId", "==", currentStudentId));
                const subSnap = await getDocs(subQ);
                
                const isSubmitted = !subSnap.empty;
                
                let buttonHTML = "";
                let statusFeedback = "";

                if (!isSubmitted) {
                    activeAssignmentsCount++;
                    
                    if (isViewOnly) {
                        buttonHTML = `<span class="text-xs font-bold text-slate-400">Not Submitted</span>`;
                    } else {
                        buttonHTML = `<button class="btn-submit-task bg-brand text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md hover:bg-blue-700 transition" data-id="${docSnap.id}" data-title="${data.title}">Submit Task</button>`;
                    }
                } else {
                    const subData = subSnap.docs[0].data();
                    const currentStatus = subData.status || 'pending_review';
                    
                    if (currentStatus === 'approved') {
                        buttonHTML = `<button disabled class="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl text-xs font-bold cursor-not-allowed border border-emerald-200"><i class="fa-solid fa-check-double mr-1"></i> Approved</button>`;
                        statusFeedback = `<p class="text-[11px] text-emerald-600 font-bold mt-3 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100"><i class="fa-solid fa-circle-check mr-1"></i> Teacher: ${subData.teacherRemark || 'Great work!'}</p>`;
                    } else if (currentStatus === 'rejected') {
                        buttonHTML = `<button disabled class="bg-red-100 text-red-700 px-4 py-2 rounded-xl text-xs font-bold cursor-not-allowed border border-red-200"><i class="fa-solid fa-xmark mr-1"></i> Rejected</button>`;
                        statusFeedback = `<p class="text-[11px] text-red-600 font-bold mt-3 bg-red-50 px-3 py-2 rounded-lg border border-red-100"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Reason: ${subData.teacherRemark || 'Please review and resubmit'}</p>`;
                    } else {
                        buttonHTML = `<button disabled class="bg-yellow-100 text-yellow-700 px-4 py-2 rounded-xl text-xs font-bold cursor-not-allowed border border-yellow-200"><i class="fa-solid fa-clock mr-1"></i> Under Review</button>`;
                    }
                }

                container.innerHTML += `
                    <div class="p-5 ${isSubmitted ? 'bg-slate-50 border-slate-200' : 'bg-white border-blue-100'} rounded-2xl border mb-2 shadow-sm flex flex-col justify-between transition hover:shadow-md">
                        <div>
                            <div class="flex justify-between items-start mb-3">
                                <div class="${isSubmitted ? 'bg-slate-200 text-slate-500' : 'bg-blue-100 text-brand'} w-10 h-10 rounded-xl flex items-center justify-center text-lg"><i class="fa-solid fa-file-pen"></i></div>
                                <p class="text-[10px] font-black text-red-500 bg-red-50 px-2 py-1 rounded-lg">DUE: ${formattedDate}</p>
                            </div>
                            <p class="font-bold text-base ${isSubmitted ? 'text-slate-500 line-through' : 'text-slate-800'}">${data.title}</p>
                            <p class="text-xs text-slate-500 font-bold uppercase mt-1">Subject: <span class="text-brand">${data.subjectName}</span></p>
                            ${statusFeedback}
                        </div>
                        <div class="flex justify-end mt-4 pt-4 border-t border-slate-100">
                            ${buttonHTML}
                        </div>
                    </div>
                `;
            }
            
            if (document.getElementById("statAssignments")) {
                document.getElementById("statAssignments").innerText = activeAssignmentsCount;
            }
        } catch (error) {
            console.error("Error loading assignments:", error);
        }
    }

    // ================= 6. FETCH REMARKS (WITH TEACHER NAME) =================
    async function loadMyRemarks() {
        const container = document.getElementById("myRemarksContainer");
        if (!container) {
            return;
        }

        try {
            const snapshot = await getDocs(query(collection(db, "remarks"), where("studentId", "==", currentStudentId)));
            container.innerHTML = "";

            if (snapshot.empty) {
                container.innerHTML = "<p class='text-slate-500 text-sm p-4'>No feedback received yet.</p>";
                return;
            }

            for (const docSnap of snapshot.docs) {
                const data = docSnap.data();
                
                // Fetch Teacher Name
                const teacherDoc = await getDoc(doc(db, "users", data.teacherId));
                const teacherName = teacherDoc.exists() ? teacherDoc.data().name : "A Teacher";

                container.innerHTML += `
                    <div class="p-4 border-l-4 border-brand bg-blue-50/50 rounded-r-xl mb-3 shadow-sm">
                        <p class="text-sm font-bold text-slate-800">"${data.remark}"</p>
                        <p class="text-[10px] text-slate-500 font-bold uppercase mt-2">From: Prof. ${teacherName}</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error("Error loading remarks:", error);
        }
    }

    // ================= 7. GLOBAL EVENT DELEGATION (ALL CLICKS) =================
    document.addEventListener("click", async (e) => {
        
        // --- MARK PRESENT ---
        if (!isViewOnly && e.target.closest('#btnMarkPresent')) {
            e.preventDefault();
            const btnMarkPresent = e.target.closest('#btnMarkPresent');
            
            if (!activeSessionId) {
                return;
            }
            
            btnMarkPresent.disabled = true;
            btnMarkPresent.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Marking...`;

            try {
                const checkQ = query(collection(db, "attendance_marks"), where("sessionId", "==", activeSessionId), where("studentId", "==", currentStudentId));
                const checkSnap = await getDocs(checkQ);
                
                if (!checkSnap.empty) {
                    alert("You have already marked your attendance for this session!");
                    btnMarkPresent.innerHTML = `Done`;
                    return;
                }

                await addDoc(collection(db, "attendance_marks"), {
                    sessionId: activeSessionId, 
                    studentId: currentStudentId, 
                    sectionId: currentStudentSection, 
                    timestamp: serverTimestamp(), 
                    status: "Present"
                });

                btnMarkPresent.classList.replace("bg-white", "bg-green-500");
                btnMarkPresent.classList.replace("text-brand", "text-white");
                btnMarkPresent.innerHTML = `Marked Present`;
                
                loadMyHistoryAndGraph(); 
            } catch (error) {
                console.error("Attendance Error:", error); 
                alert("Error marking attendance.");
                btnMarkPresent.disabled = false;
                btnMarkPresent.innerHTML = `Mark Present Now`;
            }
        }

        // --- OPEN SUBMIT TASK MODAL ---
        if (!isViewOnly && e.target.closest('.btn-submit-task')) {
            e.preventDefault();
            const btn = e.target.closest('.btn-submit-task');
            currentAssignmentIdToSubmit = btn.getAttribute("data-id");
            
            const submitTaskTitle = document.getElementById("submitTaskTitle");
            if (submitTaskTitle) {
                submitTaskTitle.innerText = btn.getAttribute("data-title");
            }
            
            const submitModal = document.getElementById("submitModal");
            if (submitModal) {
                submitModal.classList.remove("hidden");
            }
        }

        // --- CLOSE SUBMIT TASK MODAL ---
        if (e.target.closest('#btnCloseSubmit')) {
            e.preventDefault();
            const submitModal = document.getElementById("submitModal");
            if (submitModal) {
                submitModal.classList.add("hidden");
            }
            
            const submitAnswer = document.getElementById("submitAnswer");
            if (submitAnswer) {
                submitAnswer.value = "";
            }
            
            const submitFile = document.getElementById("submitFile");
            if (submitFile) {
                submitFile.value = "";
            }
        }

        // --- CONFIRM SUBMIT (FILE UPLOAD TO STORAGE & FIRESTORE) ---
        if (!isViewOnly && e.target.closest('#btnConfirmSubmit')) {
            e.preventDefault();
            
            const answerTextEl = document.getElementById("submitAnswer");
            const answerText = answerTextEl ? answerTextEl.value.trim() : "";
            
            const fileInput = document.getElementById("submitFile");
            const file = fileInput ? fileInput.files[0] : null;

            if (!answerText && !file) {
                alert("Please provide an answer or attach a file!");
                return;
            }

            const btn = document.getElementById("btnConfirmSubmit");
            if (btn) {
                btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Uploading...`; 
                btn.disabled = true;
            }

            try {
                let fileUrl = "";
                
                // Upload to Storage if file exists
                if (file) {
                    const fileRef = ref(storage, `assignments/${currentStudentId}/${Date.now()}_${file.name}`);
                    await uploadBytes(fileRef, file);
                    fileUrl = await getDownloadURL(fileRef); 
                }

                // Save to Firestore
                await addDoc(collection(db, "assignment_submissions"), {
                    assignmentId: currentAssignmentIdToSubmit, 
                    studentId: currentStudentId, 
                    sectionId: currentStudentSection, 
                    answer: answerText, 
                    fileUrl: fileUrl, 
                    status: "pending_review",
                    submittedAt: serverTimestamp()
                });

                const submitModal = document.getElementById("submitModal");
                if (submitModal) {
                    submitModal.classList.add("hidden");
                }
                
                if (answerTextEl) {
                    answerTextEl.value = "";
                }
                
                if (fileInput) {
                    fileInput.value = "";
                }
                
                alert("Assignment submitted successfully!");
                loadMyAssignments(); 
            } catch (error) { 
                console.error("Upload error:", error);
                alert("Failed to submit task. Please try again."); 
            } finally { 
                if (btn) {
                    btn.innerHTML = "Submit Task"; 
                    btn.disabled = false; 
                }
            }
        }

        // --- LOGOUT ---
        if (e.target.closest('#btnLogout')) {
            e.preventDefault();
            if (isViewOnly) {
                window.close(); 
            } else {
                signOut(auth).then(() => window.location.replace("/login"));
            }
        }
    });
});