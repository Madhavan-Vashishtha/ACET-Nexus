import { auth, db, storage } from "./firebase.js"; 
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, getDocs, addDoc, doc, getDoc, serverTimestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

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

            if (activeTabId === targetId) return;

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

    // ================= 1. AUTHENTICATE & ISOLATED LOAD =================
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.replace("/login");
            return;
        }

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
    });

    function setupImpersonationUI() {
        const header = document.querySelector("header");
        if(header) {
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
            if(userDoc.exists()) {
                const data = userDoc.data();
                const fullName = data.name || "Student";
                
                if(document.getElementById("welcomeText")) {
                    document.getElementById("welcomeText").innerText = `${fullName} ${isViewOnly ? '(View Mode)' : ''}`;
                }
                
                currentStudentSection = data.section ? data.section.trim().toUpperCase() : "Unassigned";
                
                if(document.getElementById("studentSectionBadge")) {
                    document.getElementById("studentSectionBadge").innerText = `SEC: ${currentStudentSection}`;
                }
                
                if(document.getElementById("currentDateDisplay")) {
                    document.getElementById("currentDateDisplay").innerText = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
                }

                const nameParts = fullName.trim().split(/\s+/);
                let initials = "U";
                if (nameParts.length === 1) {
                    initials = nameParts[0][0].toUpperCase();
                } else if (nameParts.length >= 2) {
                    initials = (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
                }
                if(document.getElementById("userAvatarInitials")) {
                    document.getElementById("userAvatarInitials").innerText = initials;
                }
                
                setupEditableTarget();

                try { listenForLiveSession(); } catch(e) { console.error("Live Session Error:", e); }
                try { await loadMyHistoryAndGraph(); } catch(e) { console.error("History/Graph Error:", e); }
                try { await loadMyAssignments(); } catch(e) { console.error("Assignments Error:", e); }
                try { await loadMyRemarks(); } catch(e) { console.error("Remarks Error:", e); }
                try { await loadMySubjects(); } catch(e) { console.error("Subjects Error:", e); }
            }
        } catch (error) {
            console.error("Critical User Load Error:", error);
        }
    }

    // ================= 2. LOAD SUBJECTS =================
    async function loadMySubjects() {
        const container = document.getElementById("mySubjectsContainer");
        if(!container) return;

        if (currentStudentSection === "Unassigned") {
            container.innerHTML = "<p class='text-slate-500 text-sm'>You are not assigned to a section yet. Update your profile.</p>";
            return;
        }

        const q = query(collection(db, "teacher_assignments"), where("sectionId", "==", currentStudentSection));
        const snapshot = await getDocs(q);
        container.innerHTML = "";

        if(snapshot.empty) {
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

    // ================= 3. LIVE SESSION =================
    function listenForLiveSession() {
        if(currentStudentSection === "Unassigned") return;
        const sessionQuery = query(collection(db, "attendance_sessions"), where("sectionId", "==", currentStudentSection), where("isActive", "==", true));

        onSnapshot(sessionQuery, (snapshot) => {
            const banner = document.getElementById("liveSessionBanner");
            if(!banner) return;

            if (!snapshot.empty) {
                const sessionData = snapshot.docs[0].data();
                activeSessionId = snapshot.docs[0].id;
                
                const liveSubjectName = document.getElementById("liveSubjectName");
                if(liveSubjectName) liveSubjectName.innerText = sessionData.subject;
                
                const btnMarkPresent = document.getElementById("btnMarkPresent");
                if(isViewOnly && btnMarkPresent) btnMarkPresent.classList.add("hidden");
                
                banner.classList.remove("hidden");
                setTimeout(() => {
                    banner.classList.remove("scale-95", "opacity-0");
                    banner.classList.add("scale-100", "opacity-100");
                }, 50);
            } else {
                activeSessionId = null;
                banner.classList.remove("scale-100", "opacity-100");
                banner.classList.add("scale-95", "opacity-0");
                setTimeout(() => { banner.classList.add("hidden"); }, 500);
            }
        });
    }

    // ================= 4. HISTORY, GRAPHS & LOGS (JS SORTED) =================
    async function loadMyHistoryAndGraph() {
        if(currentStudentSection === "Unassigned") return;

        // Fetch All sessions WITHOUT orderBy to avoid Firebase Composite Index error
        const sessQ = query(collection(db, "attendance_sessions"), where("sectionId", "==", currentStudentSection));
        const sessSnap = await getDocs(sessQ);
        
        let allSessions = [];
        sessSnap.forEach(doc => {
            const data = doc.data();
            if(data.createdAt) {
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
            if(data.timestamp) {
                allMarks.push({ id: doc.id, ...data, time: data.timestamp.toDate().getTime() });
            }
        });

        const classesAttended = attendedSet.size;
        let percentage = totalHeld > 0 ? Math.round((classesAttended / totalHeld) * 100) : 0;
        let missedClasses = totalHeld > classesAttended ? totalHeld - classesAttended : 0;

        if(document.getElementById("statTotalSessions")) {
            document.getElementById("statTotalSessions").innerText = classesAttended; // Lectures Attended
        }
        if(document.getElementById("statAttPercent")) {
            document.getElementById("statAttPercent").innerText = `${percentage}%`;
        }
        if(document.getElementById("graphPercentage")) {
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
            if(!container) return;
            container.innerHTML = "";
            if(allMarks.length === 0) {
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
    }

    function drawChart(attended, missed) {
        const ctx = document.getElementById('attendanceChart');
        if(!ctx) return;

        if(attendanceChartInstance) attendanceChartInstance.destroy(); 
        const dataVals = (attended === 0 && missed === 0) ? [1] : [attended, missed];
        const bgColors = (attended === 0 && missed === 0) ? ['#e2e8f0'] : ['#4361ee', '#e2e8f0'];

        attendanceChartInstance = new Chart(ctx.getContext('2d'), {
            type: 'doughnut',
            data: { labels: ['Present', 'Absent'], datasets: [{ data: dataVals, backgroundColor: bgColors, borderWidth: 0, hoverOffset: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false }, tooltip: { enabled: (attended !== 0 || missed !== 0) } } }
        });
    }

    function drawLineChart(labels, data) {
        const ctx = document.getElementById('attendanceLineChart');
        if(!ctx) return;

        if(attendanceLineChartInstance) attendanceLineChartInstance.destroy();
        
        attendanceLineChartInstance = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Cumulative Attendance Rate',
                    data: data,
                    borderColor: '#4361ee',
                    backgroundColor: 'rgba(67, 97, 238, 0.1)',
                    fill: true, tension: 0.4, borderWidth: 3, pointBackgroundColor: '#fff', pointBorderColor: '#4361ee', pointRadius: 4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 } } }
        });
    }

    function setupEditableTarget() {
        const targetText = document.getElementById("targetText"); 
        if(!targetText) return;
        const savedTarget = localStorage.getItem(`target_${currentStudentId}`) || 75;
        targetText.innerText = savedTarget + "%";

        targetText.parentElement.style.cursor = "pointer";
        targetText.parentElement.title = "Click to Edit Target";
        
        targetText.parentElement.addEventListener("click", () => {
            let newTarget = prompt("Set your target attendance percentage (0-100):", savedTarget);
            if(newTarget !== null && !isNaN(newTarget) && newTarget >= 0 && newTarget <= 100) {
                localStorage.setItem(`target_${currentStudentId}`, newTarget);
                targetText.innerText = newTarget + "%";
            }
        });
    }

    // ================= 5. LOAD ASSIGNMENTS =================
    async function loadMyAssignments() {
        const container = document.getElementById("myAssignmentsContainer");
        if(!container) return;

        if(currentStudentSection === "Unassigned") {
            container.innerHTML = "<p class='text-slate-500 text-sm col-span-2'>No pending assignments right now.</p>";
            return;
        }

        const snapshot = await getDocs(query(collection(db, "assignments"), where("sectionId", "==", currentStudentSection)));
        container.innerHTML = "";
        
        let activeAssignmentsCount = 0;

        if(snapshot.empty) {
            if(document.getElementById("statAssignments")) document.getElementById("statAssignments").innerText = "0";
            container.innerHTML = "<p class='text-slate-500 text-sm col-span-2'>No pending assignments right now.</p>";
            return;
        }

        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const formattedDate = new Date(data.dueDate).toLocaleDateString();

            const subSnap = await getDocs(query(collection(db, "assignment_submissions"), where("assignmentId", "==", docSnap.id), where("studentId", "==", currentStudentId)));
            const isSubmitted = !subSnap.empty;
            if(!isSubmitted) activeAssignmentsCount++;

            let buttonHTML = `<button disabled class="bg-green-100 text-green-700 px-4 py-2 rounded-xl text-xs font-bold cursor-not-allowed"><i class="fa-solid fa-check-double mr-1"></i> Submitted</button>`;
            
            if(!isSubmitted) {
                buttonHTML = isViewOnly ? 
                `<span class="text-xs font-bold text-slate-400">Not Submitted</span>` : 
                `<button class="btn-submit-task bg-brand text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md hover:bg-blue-700 transition" data-id="${docSnap.id}" data-title="${data.title}">Submit Task</button>`;
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
                    </div>
                    <div class="flex justify-end mt-4 pt-4 border-t border-slate-100">
                        ${buttonHTML}
                    </div>
                </div>
            `;
        }
        if(document.getElementById("statAssignments")) {
            document.getElementById("statAssignments").innerText = activeAssignmentsCount;
        }
    }

    // ================= 6. FETCH REMARKS =================
    async function loadMyRemarks() {
        const container = document.getElementById("myRemarksContainer");
        if(!container) return;

        const snapshot = await getDocs(query(collection(db, "remarks"), where("studentId", "==", currentStudentId)));
        container.innerHTML = "";

        if(snapshot.empty) {
            container.innerHTML = "<p class='text-slate-500 text-sm p-4'>No feedback received yet.</p>";
            return;
        }

        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const teacherDoc = await getDoc(doc(db, "users", data.teacherId));
            const teacherName = teacherDoc.exists() ? teacherDoc.data().name : "A Teacher";

            container.innerHTML += `
                <div class="p-4 border-l-4 border-brand bg-blue-50/50 rounded-r-xl mb-3 shadow-sm">
                    <p class="text-sm font-bold text-slate-800">"${data.remark}"</p>
                    <p class="text-[10px] text-slate-500 font-bold uppercase mt-2">From: Prof. ${teacherName}</p>
                </div>
            `;
        }
    }

    // ================= 7. GLOBAL EVENT DELEGATION (ALL CLICKS) =================
    document.addEventListener("click", async (e) => {
        
        // Mark Present
        if (!isViewOnly && e.target.closest('#btnMarkPresent')) {
            const btnMarkPresent = e.target.closest('#btnMarkPresent');
            if(!activeSessionId) return;
            btnMarkPresent.disabled = true;
            btnMarkPresent.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Marking...`;

            try {
                const checkQ = query(collection(db, "attendance_marks"), where("sessionId", "==", activeSessionId), where("studentId", "==", currentStudentId));
                const checkSnap = await getDocs(checkQ);
                if(!checkSnap.empty) {
                    alert("You have already marked your attendance!");
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
                console.error(error); 
                alert("Error marking attendance.");
                btnMarkPresent.disabled = false;
                btnMarkPresent.innerHTML = `Mark Present Now`;
            }
        }

        // Open Submit Task Modal
        if (!isViewOnly && e.target.closest('.btn-submit-task')) {
            const btn = e.target.closest('.btn-submit-task');
            currentAssignmentIdToSubmit = btn.getAttribute("data-id");
            const submitTaskTitle = document.getElementById("submitTaskTitle");
            if(submitTaskTitle) submitTaskTitle.innerText = btn.getAttribute("data-title");
            const submitModal = document.getElementById("submitModal");
            if(submitModal) submitModal.classList.remove("hidden");
        }

        // Close Submit Task Modal
        if (e.target.closest('#btnCloseSubmit')) {
            const submitModal = document.getElementById("submitModal");
            if(submitModal) submitModal.classList.add("hidden");
            const submitAnswer = document.getElementById("submitAnswer");
            if(submitAnswer) submitAnswer.value = "";
            const submitFile = document.getElementById("submitFile");
            if(submitFile) submitFile.value = "";
        }

        // 🔥 FIREBASE STORAGE UPLOAD LOGIC 🔥
        if (!isViewOnly && e.target.closest('#btnConfirmSubmit')) {
            const answerTextEl = document.getElementById("submitAnswer");
            const answerText = answerTextEl ? answerTextEl.value.trim() : "";
            const fileInput = document.getElementById("submitFile");
            const file = fileInput ? fileInput.files[0] : null;

            if(!answerText && !file) {
                alert("Please provide an answer or attach a file!");
                return;
            }

            const btn = document.getElementById("btnConfirmSubmit");
            if(btn) {
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
                    submittedAt: serverTimestamp()
                });

                const submitModal = document.getElementById("submitModal");
                if(submitModal) submitModal.classList.add("hidden");
                if(answerTextEl) answerTextEl.value = "";
                if(fileInput) fileInput.value = "";
                loadMyAssignments(); 
            } catch(error) { 
                console.error("Upload error:", error);
                alert("Failed to submit task."); 
            } finally { 
                if(btn) {
                    btn.innerHTML = "Submit Task"; 
                    btn.disabled = false; 
                }
            }
        }

        // Logout
        if (e.target.closest('#btnLogout')) {
            if(isViewOnly) window.close(); 
            else signOut(auth).then(() => window.location.replace("/login"));
        }
    });
});