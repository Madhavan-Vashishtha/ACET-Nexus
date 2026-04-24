import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, getDocs, addDoc, doc, updateDoc, deleteDoc, getDoc, serverTimestamp, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
    
    // ================= CUSTOM TOAST NOTIFICATION =================
    window.showToast = function(msg, type='success') {
        const container = document.getElementById('toastContainer');
        if(!container) return;
        const toast = document.createElement('div');
        const bg = type === 'success' ? 'bg-emerald-500' : (type === 'error' ? 'bg-red-500' : 'bg-slate-800');
        const icon = type === 'success' ? 'fa-check-circle' : (type === 'error' ? 'fa-triangle-exclamation' : 'fa-info-circle');
        toast.className = `${bg} text-white px-5 py-3 rounded-xl shadow-xl transform translate-y-10 opacity-0 transition-all duration-300 text-sm font-bold flex items-center gap-3`;
        toast.innerHTML = `<i class="fa-solid ${icon}"></i> ${msg}`;
        container.appendChild(toast);
        
        setTimeout(() => toast.classList.remove('translate-y-10', 'opacity-0'), 10);
        setTimeout(() => {
            toast.classList.add('translate-y-10', 'opacity-0');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

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

    // ================= TAB SWITCHING & SCROLL RESET =================
    document.querySelectorAll(".nav-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const targetId = btn.getAttribute("data-target");
            
            document.querySelectorAll(".nav-btn").forEach(b => {
                b.classList.remove("bg-gradient-to-r", "from-indigo-500", "to-purple-600", "text-white", "shadow-md");
                b.classList.add("text-slate-400");
            });
            btn.classList.add("bg-gradient-to-r", "from-indigo-500", "to-purple-600", "text-white", "shadow-md");
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
            
            if (targetId !== "view-overview") history.pushState({ tab: targetId }, ""); else history.replaceState({ tab: targetId }, "");
        });
    });

    history.replaceState({ tab: 'view-overview' }, "");

    window.addEventListener("popstate", (e) => {
        
        const scrollArea = document.getElementById('mainScrollArea');
        if (scrollArea) scrollArea.scrollTop = 0;

        if (sidebar && !sidebar.classList.contains("-translate-x-full")) {
            toggleMobileMenu();
            return;
        }

        if (e.state && e.state.tab) {
           
            document.querySelectorAll(".tab-content").forEach(v => { 
                v.classList.remove("active"); v.classList.add("hidden"); 
            });
           
            const targetView = document.getElementById(e.state.tab);
            if (targetView) { 
                targetView.classList.remove("hidden"); targetView.classList.add("active"); 
            }

            document.querySelectorAll(".nav-btn").forEach(b => {
                if(b.getAttribute('data-target') === e.state.tab) {
                    b.classList.add("bg-gradient-to-r", "from-indigo-500", "to-purple-600", "text-white", "shadow-md");
                    b.classList.remove("text-slate-400");
                } else {
                    b.classList.remove("bg-gradient-to-r", "from-indigo-500", "to-purple-600", "text-white", "shadow-md");
                    b.classList.add("text-slate-400");
                }
            });
        } else {
            window.location.replace("/");
        }
    });

    // ================= INBOX LOGIC =================
    const inboxModal = document.getElementById("inboxModal");
    const btnOpenInbox = document.getElementById("btnOpenInbox");
    const btnCloseInbox = document.getElementById("btnCloseInbox");
    const inboxMessagesList = document.getElementById("inboxMessagesList");
    const inboxBadge = document.getElementById("inboxBadge");
    
    if(btnOpenInbox) {
        btnOpenInbox.addEventListener("click", () => inboxModal.classList.remove("hidden"));
        btnCloseInbox.addEventListener("click", () => inboxModal.classList.add("hidden"));

        const messagesQuery = query(collection(db, "contact_messages"), orderBy("timestamp", "desc"));
        onSnapshot(messagesQuery, (snapshot) => {
            inboxMessagesList.innerHTML = "";
            let unreadCount = 0;
            if (snapshot.empty) {
                inboxMessagesList.innerHTML = '<p class="text-center text-slate-400 text-sm py-10 font-medium">No messages yet.</p>';
                inboxBadge.classList.add("hidden"); return;
            }
            snapshot.forEach(docSnap => {
                const msg = docSnap.data();
                if (msg.status === "unread") unreadCount++;
                const time = msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleString('en-US', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : "Just now";
                inboxMessagesList.innerHTML += `
                    <div class="p-4 bg-white border border-slate-100 rounded-xl shadow-sm">
                        <div class="flex justify-between items-start mb-2">
                            <h3 class="font-bold text-sm text-slate-800">${msg.name}</h3>
                            <span class="text-[9px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">${time}</span>
                        </div>
                        <p class="text-[10px] font-bold text-brand mb-3"><i class="fa-solid fa-envelope mr-1"></i> ${msg.email}</p>
                        <p class="text-xs font-medium text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">${msg.message}</p>
                    </div>`;
            });
            inboxBadge.innerText = unreadCount;
            if (unreadCount > 0) inboxBadge.classList.remove("hidden"); else inboxBadge.classList.add("hidden");
        });
    }

    // ================= AUTHENTICATE =================
    onAuthStateChanged(auth, async (user) => {
        if (!user) return window.location.replace("/login");

        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists() && userDoc.data().role === "admin") {
            const adminName = userDoc.data().name || "Admin";
            if(document.getElementById("adminName")) document.getElementById("adminName").innerText = adminName;
            if(document.getElementById("currentDateDisplay")) document.getElementById("currentDateDisplay").innerText = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            
            let initials = "A"; if (adminName.length > 0) initials = adminName[0].toUpperCase();
            if(document.getElementById("userAvatarInitials")) document.getElementById("userAvatarInitials").innerText = initials;
            if(document.getElementById("mobileAvatarInitials")) document.getElementById("mobileAvatarInitials").innerText = initials;

            loadStats(); loadPendingApprovals(); loadSections(); loadStudents(); loadTeachers(); loadAllocations(); loadAdminRecentSessions();
        } else window.location.replace("/login");
    });

    // ================= DASHBOARD STATS =================
    async function loadStats() {
        const usersSnap = await getDocs(collection(db, "users"));
        let students = 0, teachers = 0, pending = 0;
        usersSnap.forEach(doc => {
            const data = doc.data();
            if (data.status === "pending") pending++;
            else if (data.role === "student") students++;
            else if (data.role === "teacher") teachers++;
        });

        if(document.getElementById("statStudents")) document.getElementById("statStudents").innerText = students;
        if(document.getElementById("statTeachers")) document.getElementById("statTeachers").innerText = teachers;
        if(document.getElementById("statPending")) document.getElementById("statPending").innerText = pending;

        const badge = document.getElementById("badgeApprovals");
        if(badge) {
            if (pending > 0) { badge.innerText = pending; badge.classList.remove("hidden"); } 
            else badge.classList.add("hidden");
        }

        const sectionsSnap = await getDocs(collection(db, "sections"));
        if(document.getElementById("statClasses")) document.getElementById("statClasses").innerText = sectionsSnap.size;
    }

    // ================= REGISTRATION APPROVALS =================
    async function loadPendingApprovals() {
        const list = document.getElementById("adminApprovalsList"); if(!list) return;
        list.innerHTML = "";
        const snapshot = await getDocs(query(collection(db, "users"), where("status", "==", "pending")));

        if(snapshot.empty) { list.innerHTML = "<tr><td colspan='4' class='text-center py-8 text-slate-500 font-medium text-sm'>No pending requests.</td></tr>"; return; }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const roleColor = data.role === 'teacher' ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-blue-50 text-blue-600 border-blue-100';
            list.innerHTML += `
                <tr class="hover:bg-slate-50/50 transition-colors">
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-3">
                            <div class="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-xs shrink-0">${data.name.charAt(0).toUpperCase()}</div>
                            <div><p class="font-bold text-sm text-slate-800">${data.name}</p><p class="text-[10px] text-slate-400 font-medium">${data.email}</p></div>
                        </div>
                    </td>
                    <td class="px-6 py-4"><span class="px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest border ${roleColor}">${data.role}</span></td>
                    <td class="px-6 py-4"><span class="px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest bg-yellow-50 text-yellow-600 border border-yellow-100">Pending</span></td>
                    <td class="px-6 py-4 text-right">
                        <div class="flex justify-end gap-2">
                            <button class="btn-approve w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white border border-emerald-100 transition-colors flex items-center justify-center shadow-sm" data-id="${docSnap.id}"><i class="fa-solid fa-check text-xs pointer-events-none"></i></button>
                            <button class="btn-reject w-8 h-8 rounded-full bg-red-50 text-red-500 hover:bg-red-500 hover:text-white border border-red-100 transition-colors flex items-center justify-center shadow-sm" data-id="${docSnap.id}" data-email="${data.email}"><i class="fa-solid fa-xmark text-xs pointer-events-none"></i></button>
                        </div>
                    </td>
                </tr>`;
        });
    }

    // ================= MANAGE SECTIONS =================
    async function loadSections() {
        const container = document.getElementById("sectionsListContainer");
        const selSection = document.getElementById("selSection");
        if(container) container.innerHTML = ""; 
        if(selSection) selSection.innerHTML = '<option value="">-- Select Section --</option>';

        const snapshot = await getDocs(collection(db, "sections"));
        if(snapshot.empty) {
            if(container) container.innerHTML = "<p class='text-slate-400 text-xs font-medium italic col-span-2'>No active sections.</p>"; return;
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if(container) {
                container.innerHTML += `
                    <div class="flex justify-between items-center p-4 border border-slate-200 bg-white rounded-xl shadow-sm">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-500 flex items-center justify-center text-sm"><i class="fa-solid fa-layer-group"></i></div>
                            <p class="font-bold text-slate-800 text-sm">${data.name}</p>
                        </div>
                        <button class="btn-del-sec w-8 h-8 rounded-full bg-slate-50 text-slate-400 border border-transparent transition-colors flex items-center justify-center" data-id="${docSnap.id}"><i class="fa-solid fa-trash text-xs pointer-events-none"></i></button>
                    </div>`;
            }
            if(selSection) selSection.innerHTML += `<option value="${data.name}">${data.name}</option>`;
        });
    }

    // ================= MANAGE STUDENTS & LIVE SEARCH =================
    async function loadStudents() {
        const list = document.getElementById("adminStudentsList"); if(!list) return;
        list.innerHTML = `<tr><td colspan='4' class='text-center py-8 text-slate-500 text-sm font-medium'><i class="fa-solid fa-spinner fa-spin mr-2 text-brand"></i> Fetching...</td></tr>`;
        
        const snapshot = await getDocs(query(collection(db, "users"), where("role", "==", "student"), where("status", "==", "approved")));
        if(snapshot.empty) { list.innerHTML = "<tr><td colspan='4' class='text-center py-8 text-slate-500 text-sm font-medium'>No students found.</td></tr>"; return; }
        
        list.innerHTML = "";
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            list.innerHTML += `
                <tr class="student-row hover:bg-slate-50/50 transition-colors" data-search="${(data.name+' '+data.email+' '+data.username).toLowerCase()}">
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-3">
                            <div class="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs shrink-0"><i class="fa-solid fa-user-graduate"></i></div>
                            <div><p class="font-bold text-sm text-slate-800">${data.name}</p><p class="text-[10px] text-slate-400 font-medium">${data.email}</p></div>
                        </div>
                    </td>
                    <td class="px-6 py-4 text-xs font-bold text-slate-500">${data.username || '-'}</td>
                    <td class="px-6 py-4"><span class="px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest bg-slate-100 text-slate-600 border border-slate-200">${data.section || 'Not Assigned'}</span></td>
                    <td class="px-6 py-4 text-right">
                        <button class="bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 hover:border-blue-200 px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-sm transition-colors active:scale-95" onclick="window.open('/student-dashboard?viewAs=${docSnap.id}', '_blank')"><i class="fa-solid fa-eye mr-1"></i> View</button>
                    </td>
                </tr>`;
        });
    }

    const inpSearchStudent = document.getElementById("inpSearchStudent");
    if (inpSearchStudent) {
        inpSearchStudent.addEventListener("input", (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll("#adminStudentsList .student-row").forEach(row => {
                if (row.getAttribute("data-search").includes(term)) row.style.display = "";
                else row.style.display = "none";
            });
        });
    }

    // ================= MANAGE TEACHERS =================
    async function loadTeachers() {
        const container = document.getElementById("adminTeachersList"); const selTeacher = document.getElementById("selTeacher");
        if(container) container.innerHTML = ""; if(selTeacher) selTeacher.innerHTML = '<option value="">-- Select Teacher --</option>';
        const snapshot = await getDocs(query(collection(db, "users"), where("role", "==", "teacher"), where("status", "==", "approved")));

        if(snapshot.empty) { if(container) container.innerHTML = "<p class='col-span-3 text-center py-8 text-slate-400 text-sm font-medium'>No teachers found.</p>"; return; }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if(container) {
                container.innerHTML += `
                    <div class="bg-white p-6 border border-slate-200 shadow-sm hover:shadow-md rounded-3xl flex flex-col items-center text-center transition-all">
                        <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-orange-400 to-amber-500 flex items-center justify-center text-white text-2xl font-black mb-4 shadow-lg shadow-orange-500/30">${data.name.charAt(0).toUpperCase()}</div>
                        <h3 class="font-black text-slate-800 text-base mb-1">${data.name}</h3>
                        <p class="text-[10px] font-medium text-slate-400 mb-5">${data.email}</p>
                        <button class="w-full bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 py-2.5 rounded-xl font-bold text-xs transition-colors shadow-sm active:scale-95" onclick="window.open('/teacher-dashboard?viewAs=${docSnap.id}', '_blank')"><i class="fa-solid fa-chart-line mr-1"></i> Dashboard</button>
                    </div>`;
            }
            if(selTeacher) selTeacher.innerHTML += `<option value="${docSnap.id}">${data.name}</option>`;
        });
    }

    // ================= LOAD ALLOCATIONS =================
    async function loadAllocations() {
        const container = document.getElementById("allocationsContainer"); if(!container) return;
        container.innerHTML = `<p class="text-xs text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Loading...</p>`;
        const snapshot = await getDocs(collection(db, "teacher_assignments"));
        if(snapshot.empty) { container.innerHTML = "<p class='text-slate-400 text-xs font-medium italic'>No allocations yet.</p>"; return; }
        
        container.innerHTML = "";
        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const teacherDoc = await getDoc(doc(db, "users", data.teacherId));
            const teacherName = teacherDoc.exists() ? teacherDoc.data().name : "Unknown";
            container.innerHTML += `
                <div class="flex justify-between items-center p-4 bg-white rounded-2xl border border-slate-200 mb-3 shadow-sm hover:shadow transition-shadow">
                    <div>
                        <p class="font-black text-sm text-slate-800 mb-0.5">${data.subjectName} <span class="text-[9px] font-bold text-brand bg-brand/10 px-2 py-0.5 rounded border border-brand/20 ml-2 uppercase">${data.sectionId}</span></p>
                        <p class="text-[10px] text-slate-500 font-medium"><i class="fa-solid fa-chalkboard-user mr-1 text-slate-300"></i> ${teacherName}</p>
                    </div>
                    <button class="btn-delete-allocation w-8 h-8 rounded-full bg-slate-50 text-slate-400 transition-colors flex items-center justify-center shrink-0" data-id="${docSnap.id}"><i class="fa-solid fa-trash text-xs pointer-events-none"></i></button>
                </div>`;
        }
    }

    // ================= LOAD ALL ACTIVE/RECENT SESSIONS (ADMIN VIEW) =================
    async function loadAdminRecentSessions() {
        const container = document.getElementById("adminRecentSessions"); 
        if(!container) return;
        
        container.innerHTML = `<p class="text-xs text-slate-400 font-medium italic"><i class="fa-solid fa-spinner fa-spin mr-1 text-brand"></i> Loading sessions...</p>`;

        try {
            const snapshot = await getDocs(collection(db, "attendance_sessions"));
            if(snapshot.empty) { 
                container.innerHTML = "<p class='text-slate-400 text-xs font-medium italic p-2'>No sessions conducted yet.</p>"; 
                return; 
            }

            let sessions = []; 
            snapshot.forEach(d => { 
                if(d.data().createdAt) sessions.push({id: d.id, ...d.data(), time: d.data().createdAt.toDate().getTime()}); 
            });
            
            sessions.sort((a,b) => b.time - a.time);
            container.innerHTML = "";

            for (const data of sessions.slice(0, 10)) { 
                // Fetch Teacher Name
                let teacherName = "Unknown Teacher";
                if(data.teacherId) {
                    try {
                        const tDoc = await getDoc(doc(db, "users", data.teacherId));
                        if(tDoc.exists()) teacherName = tDoc.data().name;
                    } catch(e){}
                }

                const dateStr = new Date(data.time).toLocaleString('en-US', {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'});
                
                const statusBadge = data.isActive 
                    ? `<span class="bg-emerald-100 text-emerald-600 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-emerald-200 animate-pulse"><i class="fa-solid fa-circle text-[6px] align-middle mr-1"></i> Live</span>`
                    : `<span class="bg-slate-100 text-slate-500 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-slate-200">Ended</span>`;

                container.innerHTML += `
                    <div class="p-4 bg-white border border-slate-100 rounded-2xl mb-3 flex justify-between items-center shadow-sm hover:shadow transition-shadow">
                        <div>
                            <div class="flex items-center gap-2 mb-1.5">
                                <p class="font-black text-sm text-slate-800">${data.subject}</p>
                                <span class="bg-blue-50 text-blue-600 text-[9px] font-bold px-2 py-0.5 rounded border border-blue-100 uppercase tracking-wider">Sec ${data.sectionId}</span>
                            </div>
                            <p class="text-[10px] text-slate-500 font-bold"><i class="fa-solid fa-chalkboard-user mr-1 text-slate-400"></i> ${teacherName} &bull; ${dateStr}</p>
                        </div>
                        <div class="shrink-0 pl-2">${statusBadge}</div>
                    </div>`;
            }
        } catch(err) {
            console.error(err);
            container.innerHTML = "<p class='text-red-400 text-xs font-medium italic'>Failed to load sessions.</p>";
        }
    }

    // ================= GLOBAL EVENT DELEGATION (DOUBLE-TAP CONFIRM & ACTIONS) =================
    document.addEventListener("click", async (e) => {
        
        // JUMPS
        if (e.target.closest('.btn-jump-students')) { e.preventDefault(); document.querySelector('[data-target="view-students"]')?.click(); }
        if (e.target.closest('.btn-jump-teachers')) { e.preventDefault(); document.querySelector('[data-target="view-teachers"]')?.click(); }
        if (e.target.closest('.btn-jump-sections')) { e.preventDefault(); document.querySelector('[data-target="view-sections"]')?.click(); }
        if (e.target.closest('.btn-jump-approvals')) { e.preventDefault(); document.querySelector('[data-target="view-approvals"]')?.click(); }

        // APPROVE USER (Instant)
        if (e.target.closest('.btn-approve')) {
            const btn = e.target.closest('.btn-approve'); const uid = btn.getAttribute("data-id");
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-xs"></i>`; btn.disabled = true;
            await updateDoc(doc(db, "users", uid), { status: "approved" });
            window.showToast("User approved successfully", "success");
            loadStats(); loadPendingApprovals(); loadStudents(); loadTeachers();
        }

        // REJECT USER (2-Tap)
        if (e.target.closest('.btn-reject')) {
            const btn = e.target.closest('.btn-reject');
            if(btn.getAttribute('data-confirm') !== 'true') {
                btn.setAttribute('data-confirm', 'true'); btn.innerHTML = `<i class="fa-solid fa-question text-xs"></i>`; btn.classList.replace('text-red-500', 'text-white'); btn.classList.replace('bg-red-50', 'bg-red-500');
                setTimeout(() => { btn.removeAttribute('data-confirm'); btn.innerHTML = `<i class="fa-solid fa-xmark text-xs pointer-events-none"></i>`; btn.classList.replace('text-white', 'text-red-500'); btn.classList.replace('bg-red-500', 'bg-red-50'); }, 3000);
                return;
            }
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-xs"></i>`; btn.disabled = true;
            try {
                await fetch('/delete-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: btn.getAttribute("data-id") }) });
                window.showToast("Request permanently deleted", "success"); loadStats(); loadPendingApprovals();
            } catch(err) { window.showToast("Failed to delete user", "error"); loadPendingApprovals(); }
        }

        // DELETE SECTION (2-Tap)
        if (e.target.closest('.btn-del-sec')) {
            const btn = e.target.closest('.btn-del-sec');
            if(btn.getAttribute('data-confirm') !== 'true') {
                btn.setAttribute('data-confirm', 'true'); btn.innerHTML = `<i class="fa-solid fa-question text-xs"></i>`; btn.classList.replace('text-slate-400', 'text-red-500'); btn.classList.replace('bg-slate-50', 'bg-red-100');
                setTimeout(() => { btn.removeAttribute('data-confirm'); btn.innerHTML = `<i class="fa-solid fa-trash text-xs pointer-events-none"></i>`; btn.classList.replace('text-red-500', 'text-slate-400'); btn.classList.replace('bg-red-100', 'bg-slate-50'); }, 3000);
                return;
            }
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-xs"></i>`; btn.disabled = true;
            try { await deleteDoc(doc(db, "sections", btn.getAttribute("data-id"))); window.showToast("Section deleted", "success"); loadSections(); loadStats(); } 
            catch(err) { window.showToast("Failed to delete section", "error"); loadSections(); }
        }

        // DELETE ALLOCATION (2-Tap)
        if (e.target.closest(".btn-delete-allocation")) {
            const btn = e.target.closest(".btn-delete-allocation");
            if(btn.getAttribute('data-confirm') !== 'true') {
                btn.setAttribute('data-confirm', 'true'); btn.innerHTML = `<i class="fa-solid fa-question text-xs"></i>`; btn.classList.replace('text-slate-400', 'text-red-500'); btn.classList.replace('bg-slate-50', 'bg-red-100');
                setTimeout(() => { btn.removeAttribute('data-confirm'); btn.innerHTML = `<i class="fa-solid fa-trash text-xs pointer-events-none"></i>`; btn.classList.replace('text-red-500', 'text-slate-400'); btn.classList.replace('bg-red-100', 'bg-slate-50'); }, 3000);
                return;
            }
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-xs"></i>`; btn.disabled = true;
            try { await deleteDoc(doc(db, "teacher_assignments", btn.getAttribute("data-id"))); window.showToast("Allocation removed", "success"); loadAllocations(); } 
            catch(err) { window.showToast("Failed to remove", "error"); loadAllocations(); }
        }

        // CREATE SECTION
        if (e.target.closest("#btnCreateSection")) {
            const val = document.getElementById("inpNewSection")?.value.trim();
            if(!val) return window.showToast("Please enter a section name", "error");
            const btn = document.getElementById("btnCreateSection"); btn.innerHTML = "Wait..."; btn.disabled = true;
            try {
                await addDoc(collection(db, "sections"), { name: val.toUpperCase(), createdAt: serverTimestamp() });
                window.showToast("Section added successfully", "success"); document.getElementById("inpNewSection").value = ""; loadSections(); loadStats();
            } catch(err) { window.showToast("Failed to add section", "error"); } finally { btn.innerHTML = "Add Section"; btn.disabled = false; }
        }

        // MODALS (ALLOCATE)
        if (e.target.closest("#btnOpenAllocate")) { e.preventDefault(); document.getElementById("allocateModal").classList.remove("hidden"); }
        if (e.target.closest("#btnCloseAllocate")) { e.preventDefault(); document.getElementById("allocateModal").classList.add("hidden"); }
        if (e.target.closest("#btnSaveAllocate")) {
            const tId = document.getElementById("selTeacher").value; const sId = document.getElementById("selSection").value; const sName = document.getElementById("inpSubject").value.trim();
            if(!tId || !sId || !sName) return window.showToast("Fill all fields completely", "error");
            const btn = document.getElementById("btnSaveAllocate"); btn.innerHTML = "Wait..."; btn.disabled = true;
            try {
                await addDoc(collection(db, "teacher_assignments"), { teacherId: tId, sectionId: sId, subjectName: sName, allocatedAt: serverTimestamp() });
                window.showToast("Teacher allocated to section", "success"); document.getElementById("allocateModal").classList.add("hidden"); document.getElementById("inpSubject").value = ""; loadAllocations();
            } catch(err) { window.showToast("Allocation failed", "error"); } finally { btn.innerHTML = "Save"; btn.disabled = false; }
        }

        // LOGOUT
        if (e.target.closest("#btnLogout")) signOut(auth).then(() => window.location.replace("/login"));
    });
});