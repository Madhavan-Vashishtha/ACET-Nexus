import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, getDocs, addDoc, doc, updateDoc, deleteDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
    
    let currentTeacherId = null; let myAllocatedClasses = []; let isViewOnly = false;
    const urlParams = new URLSearchParams(window.location.search); const viewAsId = urlParams.get('viewAs');

    // ================= MOBILE MENU LOGIC (Z-INDEX BUG FIX) =================
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

    // ================= TAB SWITCHING & SCROLL RESET =================
    document.querySelectorAll(".nav-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const targetId = btn.getAttribute("data-target");
            
            document.querySelectorAll(".nav-btn").forEach(b => {
                b.classList.remove("bg-gradient-to-r", "from-emerald-500", "to-emerald-600", "text-white", "shadow-md");
                b.classList.add("text-slate-400");
            });
            btn.classList.add("bg-gradient-to-r", "from-emerald-500", "to-emerald-600", "text-white", "shadow-md");
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
            
            if (window.innerWidth <= 1024 && !sidebar.classList.contains("-translate-x-full")) {
                toggleMobileMenu();
            }
            
            if (targetId !== "view-dashboard") history.pushState({ tab: targetId }, ""); else history.replaceState({ tab: targetId }, "");
        });
    });

    window.addEventListener("popstate", () => {
        const scrollArea = document.getElementById('mainScrollArea');
        if (scrollArea) scrollArea.scrollTop = 0;
    });

    // ================= AUTH & DATA LOAD =================
    onAuthStateChanged(auth, async (user) => {
        if (!user) return window.location.replace("/login"); 
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (viewAsId && userDoc.data().role === "admin") {
                isViewOnly = true; currentTeacherId = viewAsId;
                document.getElementById("btnOpenSessionModal")?.classList.add("hidden"); document.getElementById("btnOpenAssign")?.classList.add("hidden");
                await loadTeacherData(viewAsId);
            } else {
                currentTeacherId = user.uid; await loadTeacherData(user.uid);
            }
        } catch (e) {}
    });

    async function loadTeacherData(uid) {
        try {
            const uDoc = await getDoc(doc(db, "users", uid));
            if (uDoc.exists()) {
                const name = uDoc.data().name || "Prof";
                if(document.getElementById("welcomeText")) document.getElementById("welcomeText").innerText = name;
                if(document.getElementById("currentDateDisplay")) document.getElementById("currentDateDisplay").innerText = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                
                // MOBILE AVATAR FIX
                if(document.getElementById("userAvatarInitials")) document.getElementById("userAvatarInitials").innerText = name[0].toUpperCase();
                if(document.getElementById("mobileAvatarInitials")) document.getElementById("mobileAvatarInitials").innerText = name[0].toUpperCase();

                await loadMyClasses(); await loadRecentSessionsLog(); await loadMyPostedAssignments(); await loadMyStudents();
            }
        } catch(e){}
    }

    // ================= LOAD CLASSES =================
    async function loadMyClasses() {
        const q = query(collection(db, "teacher_assignments"), where("teacherId", "==", currentTeacherId));
        const snap = await getDocs(q);
        const container = document.getElementById("myClassesContainer"); if(container) container.innerHTML = "";
        if(document.getElementById("statClasses")) document.getElementById("statClasses").innerText = snap.size;
        myAllocatedClasses = [];

        for (const dSnap of snap.docs) {
            const data = dSnap.data(); const secStr = (data.sectionId || "").trim().toUpperCase();
            if (!myAllocatedClasses.includes(secStr)) myAllocatedClasses.push(secStr);
            let totalStudents = 0; try { totalStudents = (await getDocs(query(collection(db, "users"), where("role", "==", "student"), where("section", "==", secStr)))).size; } catch(e){}
            
            if(container) {
                container.innerHTML += `
                    <div class="p-5 lg:p-6 bg-white rounded-2xl shadow-sm border border-slate-200 cursor-pointer transition-colors hover:bg-slate-50 active:bg-slate-100 btn-jump-students" data-sec="${secStr}">
                        <div class="flex justify-between items-start mb-4 border-b border-slate-50 pb-3">
                            <div class="w-10 h-10 lg:w-12 lg:h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-lg lg:text-xl shrink-0"><i class="fa-solid fa-chalkboard"></i></div>
                            <span class="bg-emerald-50 text-emerald-600 font-bold px-3 py-1 rounded-lg border border-emerald-100 text-[10px] uppercase tracking-widest shrink-0">Sec ${secStr}</span>
                        </div>
                        <h3 class="font-black text-slate-800 text-base lg:text-lg mb-1 truncate">${data.subjectName}</h3>
                        <p class="text-[10px] lg:text-[11px] text-slate-400 font-bold"><i class="fa-solid fa-users mr-1 text-slate-300"></i> ${totalStudents} Enrolled</p>
                    </div>`;
            }
            
            ["selMyClass", "assignSelClass", "remarkSelClass"].forEach(id => {
                if(document.getElementById(id)) document.getElementById(id).innerHTML += `<option value="${secStr}|${data.subjectName}">${data.subjectName} (Sec: ${secStr})</option>`;
            });
        }
    }

    // ================= RECENT SESSIONS =================
    async function loadRecentSessionsLog() {
        const q = query(collection(db, "attendance_sessions"), where("teacherId", "==", currentTeacherId));
        const snap = await getDocs(q);
        const container = document.getElementById("recentSessionsLog"); if(!container) return; container.innerHTML = "";
        let sessions = []; snap.forEach(d => { if(d.data().createdAt) sessions.push({id: d.id, ...d.data(), time: d.data().createdAt.toDate().getTime()}); });
        sessions.sort((a,b) => b.time - a.time);

        if (sessions.length === 0) { container.innerHTML = "<p class='text-slate-400 text-xs font-medium italic p-2'>No sessions conducted yet.</p>"; return; }

        for (const data of sessions.slice(0, 6)) {
            const dateStr = new Date(data.time).toLocaleString('en-US', {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'});
            const totalSt = (await getDocs(query(collection(db, "users"), where("role", "==", "student"), where("section", "==", (data.sectionId||"").toUpperCase())))).size;
            const attCount = (await getDocs(query(collection(db, "attendance_marks"), where("sessionId", "==", data.id)))).size;
            let pct = totalSt > 0 ? Math.round((attCount/totalSt)*100) : 0;
            let pCol = pct >= 75 ? "bg-emerald-500" : (pct >= 50 ? "bg-orange-500" : "bg-red-500");

            container.innerHTML += `
                <div class="session-log-item cursor-pointer p-4 bg-white border border-slate-100 rounded-xl flex items-center shadow-sm transition-colors hover:bg-slate-50 active:bg-slate-100 mb-3" data-session="${data.id}" data-sec="${data.sectionId}" data-subj="${data.subject}" data-time="${data.time}">
                    <div class="w-[50%] sm:w-[40%] pr-2">
                        <p class="font-black text-slate-800 text-[11px] sm:text-sm truncate">${data.subject} <span class="bg-slate-100 text-slate-500 font-bold text-[8px] sm:text-[9px] px-2 py-0.5 rounded ml-1 border border-slate-200">SEC ${data.sectionId}</span></p>
                        <p class="text-[9px] sm:text-[10px] text-slate-400 font-bold mt-1"><i class="fa-solid fa-clock mr-1"></i> ${dateStr}</p>
                    </div>
                    <div class="hidden sm:block sm:w-[30%] px-4"><div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden"><div class="${pCol} h-1.5 rounded-full" style="width: ${pct}%"></div></div></div>
                    <div class="w-[50%] sm:w-[30%] text-right"><p class="text-lg sm:text-xl font-black text-slate-800">${pct}%</p><p class="text-[8px] sm:text-[9px] uppercase font-bold text-slate-400 mt-0.5">Present: ${attCount}/${totalSt}</p></div>
                </div>`;
        }
    }

    // ================= LOAD STUDENTS =================
    async function loadMyStudents() {
        const studentContainer = document.getElementById("myStudentsListContainer");
        const filterContainer = document.getElementById("studentFiltersContainer");
        if (!studentContainer) return;
        studentContainer.innerHTML = `<tr><td colspan="4" class="p-8 text-slate-500 text-sm font-medium text-center"><i class="fa-solid fa-spinner fa-spin mr-2 text-brand"></i> Fetching students...</td></tr>`;

        if (filterContainer) {
            filterContainer.innerHTML = `<button class="filter-btn bg-slate-800 text-white px-4 lg:px-5 py-2 rounded-full text-[10px] lg:text-xs font-bold transition-colors shadow-sm" data-filter="all">All Sections</button>`;
            myAllocatedClasses.forEach(sec => filterContainer.innerHTML += `<button class="filter-btn bg-white text-slate-600 hover:bg-slate-100 border border-slate-200 px-4 lg:px-5 py-2 rounded-full text-[10px] lg:text-xs font-bold transition-colors" data-filter="${sec}">Sec ${sec}</button>`);
        }

        const q = query(collection(db, "users"), where("role", "==", "student"));
        const snapshot = await getDocs(q);
        let students = []; 
        snapshot.forEach(d => { 
            const sec = (d.data().section || "").trim().toUpperCase(); 
            if (myAllocatedClasses.includes(sec)) students.push({ id: d.id, ...d.data() }); 
        });

        if(students.length === 0) { studentContainer.innerHTML = `<tr><td colspan="4" class="p-8 text-slate-500 text-sm font-medium text-center">No students found.</td></tr>`; return; }

        const sessQ = query(collection(db, "attendance_sessions"), where("teacherId", "==", currentTeacherId));
        const sessSnap = await getDocs(sessQ);
        let secCounts = {}; let mySessIds = new Set(); 
        sessSnap.forEach(d => { mySessIds.add(d.id); const sec = (d.data().sectionId || "").toUpperCase(); secCounts[sec] = (secCounts[sec] || 0) + 1; });

        for (let i=0; i<students.length; i++) {
            const marksSnap = await getDocs(query(collection(db, "attendance_marks"), where("studentId", "==", students[i].id)));
            let att = 0; marksSnap.forEach(m => { if (mySessIds.has(m.data().sessionId)) att++; });
            const tot = secCounts[(students[i].section||"").toUpperCase()] || 0;
            students[i].pct = tot > 0 ? Math.round((att/tot)*100) : 0;
        }

        let html = '';
        students.forEach(s => {
            let col = s.pct >= 75 ? "text-emerald-600 bg-emerald-50 border-emerald-100" : (s.pct >= 50 ? "text-orange-600 bg-orange-50 border-orange-100" : "text-red-600 bg-red-50 border-red-100");
            html += `
                <tr class="student-row hover:bg-slate-50 transition-colors" data-sec="${s.section?.toUpperCase()}">
                    <td class="px-4 lg:px-6 py-4">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs shrink-0"><i class="fa-solid fa-user"></i></div>
                            <div><p class="font-bold text-[11px] lg:text-sm text-slate-800">${s.name}</p><p class="text-[9px] lg:text-[10px] text-slate-400 font-medium">${s.email}</p></div>
                        </div>
                    </td>
                    <td class="px-4 lg:px-6 py-4"><span class="px-2 py-1 rounded-md text-[9px] lg:text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">${s.section||'N/A'}</span></td>
                    <td class="px-4 lg:px-6 py-4"><span class="px-2 lg:px-3 py-1 rounded-md text-[10px] lg:text-xs font-black border ${col}">${s.pct}%</span></td>
                    <td class="px-4 lg:px-6 py-4 text-right">
                        <div class="flex justify-end gap-1.5 lg:gap-2">
                            <button class="bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 hover:border-blue-200 px-2 lg:px-3 py-1.5 rounded-lg text-[9px] lg:text-[10px] font-bold transition-colors shadow-sm" onclick="window.open('/student-dashboard?viewAs=${s.id}', '_blank')"><i class="fa-solid fa-eye lg:mr-1"></i> <span class="hidden lg:inline">View</span></button>
                            <button class="btn-quick-remark bg-white hover:bg-purple-50 text-purple-600 border border-slate-200 hover:border-purple-200 px-2 lg:px-3 py-1.5 rounded-lg text-[9px] lg:text-[10px] font-bold transition-colors shadow-sm" data-sid="${s.id}" data-sname="${s.name}"><i class="fa-solid fa-comment-dots lg:mr-1"></i> <span class="hidden lg:inline">Remark</span></button>
                        </div>
                    </td>
                </tr>`;
        });
        studentContainer.innerHTML = html;

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => { b.classList.remove('bg-slate-800','text-white','shadow-sm'); b.classList.add('bg-white','text-slate-600'); });
                e.target.classList.remove('bg-white','text-slate-600'); e.target.classList.add('bg-slate-800','text-white','shadow-sm');
                const filter = e.target.getAttribute('data-filter');
                document.querySelectorAll('.student-row').forEach(r => { r.style.display = (filter === 'all' || r.getAttribute('data-sec') === filter) ? '' : 'none'; });
            });
        });
    }

    // ================= POSTED TASKS =================
    async function loadMyPostedAssignments() {
        const snap = await getDocs(query(collection(db, "assignments"), where("teacherId", "==", currentTeacherId)));
        if(document.getElementById("statAssignments")) document.getElementById("statAssignments").innerText = snap.size;
        const cont = document.getElementById("postedAssignmentsContainer"); if(!cont) return; cont.innerHTML = "";
        if(snap.empty){ cont.innerHTML = "<p class='text-sm text-slate-500 font-medium italic p-2'>No tasks posted yet.</p>"; return; }
        
        snap.forEach(d => {
            const dt = d.data(); const formattedDate = new Date(dt.dueDate).toLocaleDateString('en-US', {month:'short', day:'numeric'});
            cont.innerHTML += `
                <div class="p-4 lg:p-5 bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all mb-3 lg:mb-4 flex justify-between items-center">
                    <div class="flex-1 overflow-hidden pr-2">
                        <p class="font-black text-sm lg:text-base text-slate-800 mb-1 truncate">${dt.title}</p>
                        <p class="text-[9px] lg:text-[10px] font-black text-slate-400 uppercase tracking-widest"><span class="text-brand mr-2">${dt.sectionId}</span> Due: <span class="text-red-400">${formattedDate}</span></p>
                    </div>
                    <button class="btn-view-subs bg-slate-50 text-brand border border-slate-200 hover:bg-brand hover:text-white px-3 lg:px-4 py-2 rounded-xl text-[9px] lg:text-[10px] font-black uppercase tracking-wider transition-colors shadow-sm shrink-0" data-id="${d.id}" data-title="${dt.title}" data-sec="${dt.sectionId}">View</button>
                </div>`;
        });
    }

    // ================= EVENT DELEGATION =================
    document.addEventListener("click", async (e) => {
        
        if (e.target.closest('.btn-jump-classes')) {
            e.preventDefault(); document.querySelector('[data-target="view-classes"]')?.click();
        }
        if (e.target.closest('.btn-jump-assignments')) {
            e.preventDefault(); document.querySelector('[data-target="view-assignments"]')?.click();
        }
        if (e.target.closest('.btn-jump-students')) {
            e.preventDefault(); const sec = e.target.closest('.btn-jump-students').getAttribute('data-sec');
            document.querySelector('[data-target="view-students"]')?.click();
            setTimeout(() => { const fBtn = document.querySelector(`.filter-btn[data-filter="${sec}"]`); if(fBtn) fBtn.click(); }, 100);
        }

        // --- SESSION DETAILS ---
        if (e.target.closest('.session-log-item')) {
            e.preventDefault(); const item = e.target.closest('.session-log-item');
            const sid = item.getAttribute("data-session"); const sec = item.getAttribute("data-sec");
            document.getElementById("sessionDetailsModal").classList.remove("hidden");
            document.getElementById("detailModalTitle").innerText = `${item.getAttribute("data-subj")} (Sec: ${sec})`;
            document.getElementById("detailModalSubtitle").innerText = new Date(parseInt(item.getAttribute("data-time"))).toLocaleString();
            
            const pList = document.getElementById("presentList"); const aList = document.getElementById("absentList");
            pList.innerHTML = "<p class='text-[10px] font-bold text-slate-400 italic p-2'>Loading...</p>"; aList.innerHTML = "<p class='text-[10px] font-bold text-slate-400 italic p-2'>Loading...</p>";

            const stSnap = await getDocs(query(collection(db, "users"), where("role", "==", "student"), where("section", "==", sec)));
            const mSnap = await getDocs(query(collection(db, "attendance_marks"), where("sessionId", "==", sid)));
            let pMap = new Map(); mSnap.forEach(m => pMap.set(m.data().studentId, m.id));

            let pHTML = ""; let aHTML = ""; let pC = 0; let aC = 0;
            stSnap.forEach(d => {
                const st = {id: d.id, ...d.data()};
                if(pMap.has(st.id)){
                    pC++; pHTML += `<div class="p-3 bg-white border border-slate-100 rounded-xl flex justify-between items-center mb-2 shadow-sm"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><i class="fa-solid fa-check text-xs"></i></div><p class="text-xs sm:text-sm font-bold text-slate-800">${st.name}</p></div>${!isViewOnly ? `<button class="btn-override-absent text-[9px] sm:text-[10px] font-black text-red-500 bg-red-50 hover:bg-red-500 hover:text-white border border-red-100 px-2 sm:px-3 py-1.5 rounded-lg transition-colors uppercase tracking-wider shrink-0" data-mark="${pMap.get(st.id)}" data-sess="${sid}">Mark Absent</button>` : ''}</div>`;
                } else {
                    aC++; aHTML += `<div class="p-3 bg-white border border-slate-100 rounded-xl flex justify-between items-center mb-2 shadow-sm"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full bg-red-100 text-red-500 flex items-center justify-center shrink-0"><i class="fa-solid fa-xmark text-xs"></i></div><p class="text-xs sm:text-sm font-bold text-slate-800">${st.name}</p></div>${!isViewOnly ? `<button class="btn-override-present text-[9px] sm:text-[10px] font-black text-emerald-600 bg-emerald-50 hover:bg-emerald-500 hover:text-white border border-emerald-100 px-2 sm:px-3 py-1.5 rounded-lg transition-colors uppercase tracking-wider shrink-0" data-st="${st.id}" data-sess="${sid}" data-sec="${sec}">Mark Present</button>` : ''}</div>`;
                }
            });
            document.getElementById("presentCount").innerText = pC; document.getElementById("absentCount").innerText = aC;
            pList.innerHTML = pHTML || "<p class='text-[10px] font-bold text-slate-400 italic p-2'>None</p>"; aList.innerHTML = aHTML || "<p class='text-[10px] font-bold text-slate-400 italic p-2'>None</p>";
        }
        if (e.target.closest('#btnCloseSessionDetails')) { e.preventDefault(); document.getElementById("sessionDetailsModal").classList.add("hidden"); loadRecentSessionsLog(); }

        if (e.target.closest('.btn-override-present') && !isViewOnly) {
            e.preventDefault(); const b = e.target.closest('.btn-override-present'); b.innerHTML = "Wait..."; b.disabled = true;
            await addDoc(collection(db, "attendance_marks"), { sessionId: b.getAttribute("data-sess"), studentId: b.getAttribute("data-st"), sectionId: b.getAttribute("data-sec"), timestamp: serverTimestamp(), status: "Present" });
            document.querySelector(`.session-log-item[data-session="${b.getAttribute("data-sess")}"]`)?.click();
        }
        if (e.target.closest('.btn-override-absent') && !isViewOnly) {
            e.preventDefault(); const b = e.target.closest('.btn-override-absent'); b.innerHTML = "Wait..."; b.disabled = true;
            await deleteDoc(doc(db, "attendance_marks", b.getAttribute("data-mark")));
            document.querySelector(`.session-log-item[data-session="${b.getAttribute("data-sess")}"]`)?.click();
        }

        // --- SUBMISSIONS MODAL (ACCORDION & RESPONSIVE FIX) ---
        if (e.target.closest('.btn-view-subs')) {
            e.preventDefault(); const btn = e.target.closest('.btn-view-subs');
            document.getElementById("subModalTitle").innerText = btn.getAttribute("data-title");
            document.getElementById("submissionsModal").classList.remove("hidden");
            const list = document.getElementById("submissionsList"); list.innerHTML = "<p class='text-xs text-slate-500'><i class='fa-solid fa-spinner fa-spin mr-2'></i> Fetching...</p>";

            const stSnap = await getDocs(query(collection(db, "users"), where("role", "==", "student"), where("section", "==", btn.getAttribute("data-sec").toUpperCase())));
            const subSnap = await getDocs(query(collection(db, "assignment_submissions"), where("assignmentId", "==", btn.getAttribute("data-id"))));
            let sMap = new Map(); subSnap.forEach(d => sMap.set(d.data().studentId, {id: d.id, ...d.data()}));

            let html = `<div class="space-y-4">`;
            stSnap.forEach(d => {
                const st = {id: d.id, ...d.data()};
                if(sMap.has(st.id)){
                    const sub = sMap.get(st.id); const stat = sub.status || 'pending';
                    html += `
                        <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                            <div class="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 cursor-pointer btn-toggle-sub hover:bg-slate-100 transition-colors" data-target="acc-${sub.id}">
                                <p class="text-sm font-bold text-slate-800 truncate pr-2"><i class="fa-solid fa-file-check text-blue-500 mr-2"></i> ${st.name}</p> 
                                <div class="flex items-center gap-2 shrink-0">
                                    <span class="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border ${stat==='approved'?'bg-emerald-50 text-emerald-600 border-emerald-200':(stat==='rejected'?'bg-red-50 text-red-600 border-red-200':'bg-amber-50 text-amber-600 border-amber-200')}">${stat}</span>
                                    <i class="fa-solid fa-chevron-down text-slate-400 text-xs transition-transform"></i>
                                </div>
                            </div>
                            <div id="acc-${sub.id}" class="hidden p-4 bg-white">
                                <div class="p-3 bg-slate-50 rounded-lg border border-slate-100 mb-3 text-xs text-slate-600 break-all">
                                    ${sub.answer||'<i class="text-slate-400">No text attached.</i>'}
                                </div>
                                ${sub.fileUrl?`<a href="${sub.fileUrl}" target="_blank" class="text-[10px] uppercase font-bold tracking-wider bg-blue-50 hover:bg-blue-100 text-blue-600 px-4 py-2.5 rounded-lg border border-blue-100 inline-flex items-center mb-3 transition-colors max-w-full truncate"><i class="fa-solid fa-download mr-2 shrink-0"></i> <span class="truncate">Download Attachment</span></a>`:''}
                                ${stat==='pending'&&!isViewOnly?`
                                    <div class="flex flex-col sm:flex-row gap-2 mt-1 w-full">
                                        <input type="text" id="rmk-${sub.id}" class="w-full sm:flex-1 text-xs border border-slate-200 p-3 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-brand" placeholder="Add remark (required for rejection)...">
                                        <div class="flex gap-2 w-full sm:w-auto">
                                            <button class="btn-approve-sub flex-1 sm:flex-none bg-emerald-500 hover:bg-emerald-600 text-white text-xs px-4 py-2.5 rounded-lg font-bold shadow-md transition-colors" data-id="${sub.id}">Approve</button>
                                            <button class="btn-reject-sub flex-1 sm:flex-none bg-red-500 hover:bg-red-600 text-white text-xs px-4 py-2.5 rounded-lg font-bold shadow-md transition-colors" data-id="${sub.id}">Reject</button>
                                        </div>
                                    </div>`:''
                                }
                            </div>
                        </div>`;
                } else {
                    html += `
                        <div class="p-4 bg-white border border-slate-100 rounded-xl flex justify-between items-center shadow-sm opacity-60">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-xs shrink-0"><i class="fa-solid fa-user"></i></div>
                                <p class="text-sm font-bold text-slate-500 truncate">${st.name}</p>
                            </div>
                            <span class="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded bg-slate-100 text-slate-400 border border-slate-200">Not Submitted</span>
                        </div>`;
                }
            });
            list.innerHTML = html + `</div>`;
        }
        if (e.target.closest('#btnCloseSubmissions')) { e.target.closest('#submissionsModal').classList.add("hidden"); }
        
        // Accordion Toggle
        if (e.target.closest('.btn-toggle-sub')) { 
            e.preventDefault(); 
            const btn = e.target.closest('.btn-toggle-sub');
            const targetId = btn.getAttribute('data-target');
            const targetDiv = document.getElementById(targetId);
            const icon = btn.querySelector('.fa-chevron-down');
            if(targetDiv) {
                targetDiv.classList.toggle('hidden');
                if(icon) icon.style.transform = targetDiv.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
            }
        }
        
        if (e.target.closest('.btn-approve-sub') && !isViewOnly) { e.preventDefault(); const b = e.target.closest('.btn-approve-sub'); const sid = b.getAttribute("data-id"); b.innerHTML="..."; b.disabled=true; await updateDoc(doc(db,"assignment_submissions",sid),{status:"approved",teacherRemark:document.getElementById(`rmk-${sid}`)?.value||"Good job!",reviewedAt:serverTimestamp()}); b.closest('.flex-col').innerHTML=`<span class="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100 w-full text-center"><i class="fa-solid fa-check mr-1"></i> Approved</span>`;}
        if (e.target.closest('.btn-reject-sub') && !isViewOnly) { e.preventDefault(); const b = e.target.closest('.btn-reject-sub'); const sid = b.getAttribute("data-id"); const r = document.getElementById(`rmk-${sid}`)?.value; if(!r) { alert("Please add a remark to reject."); return; } b.innerHTML="..."; b.disabled=true; await updateDoc(doc(db,"assignment_submissions",sid),{status:"rejected",teacherRemark:r,reviewedAt:serverTimestamp()}); b.closest('.flex-col').innerHTML=`<span class="text-[10px] text-red-600 font-bold bg-red-50 px-3 py-2 rounded-lg border border-red-100 w-full text-center"><i class="fa-solid fa-xmark mr-1"></i> Rejected</span>`;}

        // GLOBAL REMARK
        if (e.target.closest(".btn-quick-remark") && !isViewOnly) { e.preventDefault(); const b = e.target.closest(".btn-quick-remark"); document.getElementById("remarkSelClass").innerHTML = `<option value="">Direct</option>`; document.getElementById("remarkSelStudent").innerHTML = `<option value="${b.getAttribute("data-sid")}">${b.getAttribute("data-sname")}</option>`; document.getElementById("globalRemarkModal").classList.remove("hidden"); }
        if (e.target.closest("#btnOpenGlobalRemark") && !isViewOnly) { e.preventDefault(); document.getElementById("remarkSelStudent").innerHTML = '<option value="">Select Class First</option>'; document.getElementById("globalRemarkModal").classList.remove("hidden"); }
        if (e.target.closest("#btnCloseGlobalRemark")) { e.preventDefault(); document.getElementById("globalRemarkModal").classList.add("hidden"); }
        if (e.target.closest("#btnSubmitGlobalRemark") && !isViewOnly) { e.preventDefault(); const b = e.target.closest("#btnSubmitGlobalRemark"); const sid = document.getElementById("remarkSelStudent")?.value; const txt = document.getElementById("remarkText")?.value; if(!sid||!txt) return; b.innerHTML="Wait..."; b.disabled=true; await addDoc(collection(db,"remarks"),{studentId:sid,teacherId:currentTeacherId,remark:txt,type:"general",timestamp:serverTimestamp()}); document.getElementById("globalRemarkModal").classList.add("hidden"); document.getElementById("remarkText").value=""; b.innerHTML="Send Message"; b.disabled=false; }
        
        // QR SESSION
        if (e.target.closest("#btnOpenSessionModal") && !isViewOnly) { e.preventDefault(); document.getElementById("sessionModal").classList.remove("hidden"); }
        if (e.target.closest("#btnCloseSessionModal")) { e.preventDefault(); document.getElementById("sessionModal").classList.add("hidden"); }
        if (e.target.closest("#btnStartSession") && !isViewOnly) { e.preventDefault(); const val = document.getElementById("selMyClass").value; if(!val)return; const b=document.getElementById("btnStartSession"); b.innerHTML="Wait..."; b.disabled=true; const [sec, subj] = val.split("|"); const t = Math.random().toString(36).substring(2,10); const r = await addDoc(collection(db,"attendance_sessions"),{teacherId:currentTeacherId,sectionId:sec,subject:subj,createdAt:new Date(),expiresAt:new Date(Date.now()+300000),isActive:true,currentToken:t}); activeSessionId = r.id; document.getElementById("sessionModal").classList.add("hidden"); document.getElementById("qrDisplayModal").classList.remove("hidden"); document.getElementById("qrClassDisplay").innerText = subj; startSessionLogic(t); b.innerHTML="Start Live"; b.disabled=false; }
        if (e.target.closest("#btnCloseQr")) { e.preventDefault(); endSession(); }
        
        // CREATE ASSIGNMENT
        if (e.target.closest("#btnOpenAssign") && !isViewOnly) { e.preventDefault(); document.getElementById("assignModal").classList.remove("hidden"); }
        if (e.target.closest("#btnCloseAssign")) { e.preventDefault(); document.getElementById("assignModal").classList.add("hidden"); }
        if (e.target.closest("#btnSaveAssign") && !isViewOnly) { e.preventDefault(); const val = document.getElementById("assignSelClass").value; const t = document.getElementById("assignTitle").value; const d = document.getElementById("assignDue").value; if(!val||!t||!d)return; await addDoc(collection(db,"assignments"),{teacherId:currentTeacherId,sectionId:val.split("|")[0],subjectName:val.split("|")[1],title:t,dueDate:d,postedAt:new Date()}); document.getElementById("assignModal").classList.add("hidden"); loadMyPostedAssignments(); }

        if (e.target.closest("#btnLogout")) { e.preventDefault(); if (isViewOnly) window.close(); else signOut(auth).then(() => window.location.replace("/login")); }
    });

    document.addEventListener("change", async (e) => {
        if (e.target.id === "remarkSelClass") {
            const sec = e.target.value; if (!sec) return;
            const sel = document.getElementById("remarkSelStudent"); sel.innerHTML = '<option>Wait...</option>';
            const snap = await getDocs(query(collection(db, "users"), where("role", "==", "student"), where("section", "==", sec)));
            sel.innerHTML = '<option value="">-- Choose Student --</option>'; snap.forEach(d => sel.innerHTML += `<option value="${d.id}">${d.data().name}</option>`);
        }
    });

    let countdownInterval=null; let qrRefreshInterval=null; let activeSessionId=null;
    function startSessionLogic(token) {
        let t = 300; document.getElementById("qrTimerDisplay").innerText = "05:00";
        document.getElementById("qrCodeContainer").innerHTML = ""; new QRCode(document.getElementById("qrCodeContainer"), { text: `https://acet-nexus.onrender.com/scan?session=${activeSessionId}&token=${token}`, width: 200, height: 200 });
        countdownInterval = setInterval(() => { t--; document.getElementById("qrTimerDisplay").innerText = `${Math.floor(t/60).toString().padStart(2,'0')}:${(t%60).toString().padStart(2,'0')}`; if(t<=0) endSession(); }, 1000);
        qrRefreshInterval = setInterval(async () => { const nt = Math.random().toString(36).substring(2,10); await updateDoc(doc(db,"attendance_sessions",activeSessionId),{currentToken:nt}); document.getElementById("qrCodeContainer").innerHTML=""; new QRCode(document.getElementById("qrCodeContainer"),{text:`https://acet-nexus.onrender.com/scan?session=${activeSessionId}&token=${nt}`,width:200,height:200}); }, 5000);
    }
    async function endSession() { clearInterval(countdownInterval); clearInterval(qrRefreshInterval); document.getElementById("qrDisplayModal").classList.add("hidden"); if(activeSessionId) await updateDoc(doc(db,"attendance_sessions",activeSessionId),{isActive:false}); activeSessionId=null; }
});