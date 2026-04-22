import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, getDocs, addDoc, doc, updateDoc, deleteDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
    
    // ================= 0. PREMIUM TAB SWITCHING LOGIC =================
    const navBtns = document.querySelectorAll(".nav-btn");
    const views = document.querySelectorAll(".tab-content");

    navBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            // Remove active classes
            navBtns.forEach(b => {
                b.classList.remove("bg-brand", "text-white", "shadow-[0_4px_15px_rgba(79,70,229,0.4)]");
                b.classList.add("text-slate-400", "hover:bg-darkHover", "hover:text-white");
            });
            views.forEach(v => v.classList.remove("active"));

            // Add active to clicked
            btn.classList.add("bg-brand", "text-white", "shadow-[0_4px_15px_rgba(79,70,229,0.4)]");
            btn.classList.remove("text-slate-400", "hover:bg-darkHover", "hover:text-white");
            
            const targetId = btn.getAttribute("data-target");
            document.getElementById(targetId).classList.add("active");

            // 🔥 REPLACE STATE FIX FOR LOOP PREVENTION
            history.replaceState({ tab: targetId }, "");
        });
    });

    // ================= 1. AUTHENTICATE & LOAD ADMIN DATA =================
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            // 🔥 STRICT SECURITY REDIRECT (No bypass)
            window.location.replace("/login");
            return;
        }

        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists() && userDoc.data().role === "admin") {
            const adminName = userDoc.data().name || "Admin";
            document.getElementById("adminName").innerText = adminName;
            document.getElementById("currentDateDisplay").innerText = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
            
            // Set initials for avatar
            const nameParts = adminName.trim().split(/\s+/);
            let initials = "A";
            if (nameParts.length === 1) initials = nameParts[0][0].toUpperCase();
            else if (nameParts.length >= 2) initials = (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
            document.getElementById("userAvatarInitials").innerText = initials;

            // Load initial data
            loadStats();
            loadPendingApprovals();
            loadSections();
            loadStudents();
            loadTeachers();
            loadAllocations();

        } else {
            window.location.replace("/login");
        }
    });

    // ================= 2. DASHBOARD STATS =================
    async function loadStats() {
        const usersSnap = await getDocs(collection(db, "users"));
        let students = 0, teachers = 0, pending = 0;
        
        usersSnap.forEach(doc => {
            const data = doc.data();
            if (data.status === "pending") pending++;
            else if (data.role === "student") students++;
            else if (data.role === "teacher") teachers++;
        });

        document.getElementById("statStudents").innerText = students;
        document.getElementById("statTeachers").innerText = teachers;
        document.getElementById("statPending").innerText = pending;

        const badge = document.getElementById("badgeApprovals");
        if (pending > 0) {
            badge.innerText = pending;
            badge.classList.remove("hidden");
        } else {
            badge.classList.add("hidden");
        }

        const sectionsSnap = await getDocs(collection(db, "sections"));
        document.getElementById("statClasses").innerText = sectionsSnap.size;
    }

    // ================= 3. REGISTRATION APPROVALS =================
    async function loadPendingApprovals() {
        const list = document.getElementById("adminApprovalsList");
        list.innerHTML = "";
        
        const q = query(collection(db, "users"), where("status", "==", "pending"));
        const snapshot = await getDocs(q);

        if(snapshot.empty) {
            list.innerHTML = "<tr><td colspan='4' class='text-center py-8 text-slate-400 font-medium'>No pending requests.</td></tr>";
            return;
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const dateStr = data.createdAt ? new Date(data.createdAt.toDate()).toLocaleDateString() : 'N/A';
            const roleColor = data.role === 'teacher' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700';
            
            list.innerHTML += `
                <tr class="hover:bg-slate-50/50 transition">
                    <td class="px-8 py-5">
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-500">${data.name.charAt(0).toUpperCase()}</div>
                            <div>
                                <p class="font-bold text-slate-800">${data.name}</p>
                                <p class="text-xs text-slate-500">${data.email}</p>
                            </div>
                        </div>
                    </td>
                    <td class="px-8 py-5"><span class="px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${roleColor}">${data.role}</span></td>
                    <td class="px-8 py-5"><span class="px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-yellow-100 text-yellow-700">Pending</span></td>
                    <td class="px-8 py-5 text-right">
                        <div class="flex justify-end gap-2">
                            <button class="btn-approve w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-500 hover:text-white transition flex items-center justify-center" data-id="${docSnap.id}"><i class="fa-solid fa-check"></i></button>
                            <button class="btn-reject w-8 h-8 rounded-full bg-red-100 text-red-600 hover:bg-red-500 hover:text-white transition flex items-center justify-center" data-id="${docSnap.id}" data-email="${data.email}"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }

    document.getElementById("adminApprovalsList").addEventListener("click", async (e) => {
        if (e.target.closest('.btn-approve')) {
            const uid = e.target.closest('.btn-approve').getAttribute("data-id");
            if(confirm("Approve this user?")) {
                await updateDoc(doc(db, "users", uid), { status: "approved" });
                loadStats(); loadPendingApprovals(); loadStudents(); loadTeachers();
            }
        }
        if (e.target.closest('.btn-reject')) {
            const btn = e.target.closest('.btn-reject');
            const uid = btn.getAttribute("data-id");
            const email = btn.getAttribute("data-email");
            if(confirm("Reject and delete this request permanently?")) {
                try {
                    await fetch('/delete-user', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: uid })
                    });
                    loadStats(); loadPendingApprovals();
                } catch(err) { console.error(err); alert("Failed to delete user completely."); }
            }
        }
    });

    // ================= 4. MANAGE SECTIONS =================
    document.getElementById("btnCreateSection").addEventListener("click", async () => {
        const val = document.getElementById("inpNewSection").value.trim();
        if(!val) return alert("Enter section name");
        try {
            await addDoc(collection(db, "sections"), { name: val.toUpperCase(), createdAt: serverTimestamp() });
            document.getElementById("inpNewSection").value = "";
            loadSections(); loadStats();
        } catch(e) { console.error(e); alert("Failed to add section."); }
    });

    async function loadSections() {
        const container = document.getElementById("sectionsListContainer");
        const selSection = document.getElementById("selSection");
        container.innerHTML = ""; selSection.innerHTML = '<option value="">-- Select Section --</option>';

        const snapshot = await getDocs(collection(db, "sections"));
        if(snapshot.empty) return container.innerHTML = "<p class='text-slate-400 text-sm col-span-2'>No active sections.</p>";

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            container.innerHTML += `
                <div class="flex justify-between items-center p-4 border border-slate-100 bg-slate-50 rounded-xl">
                    <p class="font-bold text-slate-800 text-sm">${data.name}</p>
                    <button class="btn-del-sec text-slate-400 hover:text-red-500 transition" data-id="${docSnap.id}"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
            selSection.innerHTML += `<option value="${data.name}">${data.name}</option>`;
        });
    }

    // ================= 5. MANAGE STUDENTS =================
    async function loadStudents() {
        const list = document.getElementById("adminStudentsList");
        list.innerHTML = "";
        
        const q = query(collection(db, "users"), where("role", "==", "student"), where("status", "==", "approved"));
        const snapshot = await getDocs(q);

        if(snapshot.empty) return list.innerHTML = "<tr><td colspan='4' class='text-center py-8 text-slate-400 font-medium'>No students found.</td></tr>";

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            list.innerHTML += `
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
                    <td class="px-8 py-5"><span class="px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-600">${data.section || 'Not Assigned'}</span></td>
                    <td class="px-8 py-5 text-right">
                        <button class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-md transition" onclick="window.open('/profile?viewAs=${docSnap.id}', '_blank')">View Profile</button>
                    </td>
                </tr>
            `;
        });
    }

    // ================= 6. MANAGE TEACHERS & ALLOCATION =================
    async function loadTeachers() {
        const container = document.getElementById("adminTeachersList");
        const selTeacher = document.getElementById("selTeacher");
        container.innerHTML = ""; selTeacher.innerHTML = '<option value="">-- Select Teacher --</option>';
        
        const q = query(collection(db, "users"), where("role", "==", "teacher"), where("status", "==", "approved"));
        const snapshot = await getDocs(q);

        if(snapshot.empty) return container.innerHTML = "<p class='col-span-3 text-center py-8 text-slate-400 font-medium'>No teachers found.</p>";

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            container.innerHTML += `
                <div class="bg-white p-6 border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] rounded-3xl flex flex-col items-center text-center hover:-translate-y-1 transition-transform">
                    <div class="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center text-orange-500 text-3xl font-black mb-4 border-4 border-white shadow-md">
                        ${data.name.charAt(0).toUpperCase()}
                    </div>
                    <h3 class="font-black text-slate-800 text-lg mb-1">${data.name}</h3>
                    <p class="text-xs text-slate-500 mb-4">${data.email}</p>
                    <button class="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 py-2.5 rounded-xl font-bold text-sm transition" onclick="window.open('/teacher-dashboard?viewAs=${docSnap.id}', '_blank')">View Dashboard</button>
                </div>
            `;
            selTeacher.innerHTML += `<option value="${docSnap.id}">${data.name}</option>`;
        });
    }

    const allocateModal = document.getElementById("allocateModal");
    document.getElementById("btnOpenAllocate").addEventListener("click", () => allocateModal.classList.remove("hidden"));
    document.getElementById("btnCloseAllocate").addEventListener("click", () => allocateModal.classList.add("hidden"));

    document.getElementById("btnSaveAllocate").addEventListener("click", async () => {
        const teacherId = document.getElementById("selTeacher").value;
        const sectionId = document.getElementById("selSection").value;
        const subjectName = document.getElementById("inpSubject").value.trim();

        if(!teacherId || !sectionId || !subjectName) return alert("Fill all fields!");

        try {
            await addDoc(collection(db, "teacher_assignments"), {
                teacherId: teacherId, sectionId: sectionId, subjectName: subjectName, allocatedAt: serverTimestamp()
            });
            alert("Allocated successfully!");
            allocateModal.classList.add("hidden");
            document.getElementById("inpSubject").value = "";
            loadAllocations();
        } catch(e) { console.error(e); alert("Failed to allocate."); }
    });

    // ================= 7. LOAD ALLOCATIONS (WITH DELETE BUTTON) =================
    async function loadAllocations() {
        const container = document.getElementById("allocationsContainer");
        container.innerHTML = "";

        const snapshot = await getDocs(collection(db, "teacher_assignments"));
        if(snapshot.empty) return container.innerHTML = "<p class='text-slate-400 text-xs'>No allocations yet.</p>";

        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const teacherDoc = await getDoc(doc(db, "users", data.teacherId));
            const teacherName = teacherDoc.exists() ? teacherDoc.data().name : "Unknown";

            container.innerHTML += `
                <div class="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100 mb-2">
                    <div>
                        <p class="font-bold text-sm text-slate-800">${data.subjectName} <span class="text-[10px] text-brand ml-1">(${teacherName})</span></p>
                        <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Sec: ${data.sectionId}</p>
                    </div>
                    <button class="btn-delete-allocation text-slate-300 hover:text-red-500 transition p-2" data-id="${docSnap.id}">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
        }
    }

    // 🔥 8. DELETE ALLOCATION LOGIC 🔥
    document.getElementById("allocationsContainer").addEventListener("click", async (e) => {
        const deleteBtn = e.target.closest(".btn-delete-allocation");
        if (deleteBtn) {
            const allocationId = deleteBtn.getAttribute("data-id");
            const conf = confirm("Delete this allocation? The teacher won't see this class anymore.");
            if (conf) {
                try {
                    await deleteDoc(doc(db, "teacher_assignments", allocationId)); 
                    alert("Allocation deleted successfully!");
                    loadAllocations(); 
                } catch (error) {
                    console.error("Error deleting:", error);
                    alert("Failed to delete allocation.");
                }
            }
        }
    });

    // ================= 9. LOGOUT (REPLACE FIX) =================
    document.getElementById("btnLogout").addEventListener("click", () => {
        signOut(auth).then(() => { window.location.replace("/login"); });
    });
});