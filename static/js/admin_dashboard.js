import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, getDocs, addDoc, doc, getDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {

    if(document.getElementById("currentDateDisplay")) {
        document.getElementById("currentDateDisplay").innerText = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
    }

    // ================= 1. TAB SWITCHING LOGIC =================
    const navBtns = document.querySelectorAll(".nav-btn");
    const views = document.querySelectorAll(".tab-content");

    navBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            navBtns.forEach(b => {
                b.classList.remove("bg-brand", "text-white", "shadow-[0_4px_15px_rgba(79,70,229,0.4)]");
                b.classList.add("text-slate-400", "hover:bg-darkHover", "hover:text-white");
            });
            views.forEach(v => v.classList.remove("active"));
            
            btn.classList.add("bg-brand", "text-white", "shadow-[0_4px_15px_rgba(79,70,229,0.4)]");
            btn.classList.remove("text-slate-400", "hover:bg-darkHover", "hover:text-white");
            document.getElementById(btn.getAttribute("data-target")).classList.add("active");
        });
    });

    // ================= 2. AUTH & AVATAR LOGIC =================
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if(userDoc.exists() && userDoc.data().role === "admin") {
                const data = userDoc.data();
                const fullName = data.name || "Admin";
                
                const adminNameEl = document.getElementById("adminName");
                if(adminNameEl) adminNameEl.innerText = fullName;

                // Extract Initials
                const nameParts = fullName.trim().split(/\s+/);
                let initials = "A";
                if (nameParts.length === 1) {
                    initials = nameParts[0][0].toUpperCase();
                } else if (nameParts.length >= 2) {
                    initials = (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
                }
                const avatarEl = document.getElementById("userAvatarInitials");
                if(avatarEl) avatarEl.innerText = initials;

                // Initialize Real-time Listeners
                listenToUsersAndApprovals();
                listenToSections();
                listenToAllocations();
            } else {
                alert("Access Denied! Admins only.");
                window.location.href = "/login";
            }
        } else {
            window.location.href = "/login";
        }
    });

    // ================= 3. MANAGE SECTIONS (REAL-TIME) =================
    function listenToSections() {
        const q = query(collection(db, "sections"), orderBy("createdAt", "desc"));
        onSnapshot(q, (snapshot) => {
            const container = document.getElementById("sectionsListContainer");
            const selSection = document.getElementById("selSection"); // For allocate modal
            
            document.getElementById("statClasses").innerText = snapshot.size;
            container.innerHTML = "";
            selSection.innerHTML = '<option value="">-- Choose Section --</option>';

            if(snapshot.empty) {
                container.innerHTML = "<p class='text-slate-500 col-span-2'>No sections created yet.</p>";
                return;
            }

            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const sectionId = docSnap.id;

                container.innerHTML += `
                    <div class="bg-white border border-slate-100 shadow-sm p-4 rounded-2xl flex justify-between items-center transition hover:shadow-md">
                        <div class="flex items-center gap-4">
                            <div class="bg-brand/10 text-brand w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg"><i class="fa-solid fa-users-rectangle"></i></div>
                            <p class="font-black text-slate-800">${data.name}</p>
                        </div>
                        <button class="btn-delete-section text-red-400 hover:bg-red-50 hover:text-red-600 w-8 h-8 rounded-lg transition" data-id="${sectionId}">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                `;
                selSection.innerHTML += `<option value="${data.name}">${data.name}</option>`;
            });
        });
    }

    // Add Section
    document.getElementById("btnCreateSection").addEventListener("click", async () => {
        const btn = document.getElementById("btnCreateSection");
        const inp = document.getElementById("inpNewSection");
        const name = inp.value.trim();
        
        if(!name) return alert("Please enter a section name!");
        
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Creating...`;
        
        try {
            await addDoc(collection(db, "sections"), { name, createdAt: serverTimestamp() });
            inp.value = "";
        } catch (error) {
            console.error(error); alert("Failed to create section");
        } finally {
            btn.disabled = false;
            btn.innerHTML = `Create Section`;
        }
    });

    // Delete Section
    document.getElementById("sectionsListContainer").addEventListener("click", async (e) => {
        if(e.target.closest('.btn-delete-section')) {
            if(confirm("Are you sure you want to delete this section?")) {
                const id = e.target.closest('.btn-delete-section').getAttribute("data-id");
                await deleteDoc(doc(db, "sections", id));
            }
        }
    });

    // ================= 4. MANAGE USERS & APPROVALS (REAL-TIME) =================
    function listenToUsersAndApprovals() {
        onSnapshot(collection(db, "users"), (snapshot) => {
            let studentCount = 0, teacherCount = 0, pendingCount = 0;
            
            const studentsList = document.getElementById("adminStudentsList");
            const teachersList = document.getElementById("adminTeachersList");
            const approvalsList = document.getElementById("adminApprovalsList");
            const selTeacher = document.getElementById("selTeacher"); // For allocate modal
            
            studentsList.innerHTML = "";
            teachersList.innerHTML = "";
            approvalsList.innerHTML = "";
            selTeacher.innerHTML = '<option value="">-- Choose Teacher --</option>';

            snapshot.forEach(userDoc => {
                const data = userDoc.data();
                const uid = userDoc.id;

                // Handle Approvals
                if(data.status === "pending") {
                    pendingCount++;
                    approvalsList.innerHTML += `
                        <tr class="hover:bg-slate-50 transition border-b border-slate-50">
                            <td class="px-8 py-5">
                                <p class="font-bold text-slate-800">${data.name}</p>
                                <p class="text-[11px] text-slate-500">${data.email}</p>
                            </td>
                            <td class="px-8 py-5">
                                <span class="bg-indigo-50 text-brand px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider">${data.role}</span>
                            </td>
                            <td class="px-8 py-5"><span class="text-orange-500 font-bold text-xs bg-orange-50 px-3 py-1 rounded-lg"><i class="fa-solid fa-clock mr-1"></i> Pending</span></td>
                            <td class="px-8 py-5 text-right">
                                <button class="btn-approve bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-600 transition shadow-sm mr-2" data-uid="${uid}">Approve</button>
                                <button class="btn-deny bg-red-100 text-red-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-200 transition" data-uid="${uid}">Deny</button>
                            </td>
                        </tr>
                    `;
                    return; // Skip adding to active lists
                }

                // Handle Active Students
                if(data.role === "student" && data.status !== "pending") {
                    studentCount++;
                    studentsList.innerHTML += `
                        <tr class="hover:bg-slate-50 transition border-b border-slate-50">
                            <td class="px-8 py-4 font-bold text-slate-800">${data.name}</td>
                            <td class="px-8 py-4 text-slate-500 text-xs">${data.email}</td>
                            <td class="px-8 py-4"><span class="bg-slate-100 text-slate-600 px-3 py-1 rounded-md text-xs font-bold border border-slate-200">${data.section || 'Unassigned'}</span></td>
                            <td class="px-8 py-4 text-right">
                                <a href="/student-dashboard?viewAs=${uid}" target="_blank" class="bg-brand/10 text-brand hover:bg-brand hover:text-white px-4 py-2 rounded-lg font-bold text-xs transition inline-block"><i class="fa-solid fa-eye mr-1"></i> Portal</a>
                            </td>
                        </tr>
                    `;
                } 
                // Handle Active Teachers
                else if(data.role === "teacher" && data.status !== "pending") {
                    teacherCount++;
                    teachersList.innerHTML += `
                        <div class="bg-white p-6 rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgba(0,0,0,0.04)] flex flex-col items-center justify-center text-center transition hover:-translate-y-1">
                            <div class="w-16 h-16 bg-gradient-to-br from-purple-400 to-purple-600 text-white rounded-2xl flex items-center justify-center text-2xl mb-4 shadow-lg shadow-purple-500/30"><i class="fa-solid fa-chalkboard-user"></i></div>
                            <h3 class="font-black text-slate-800 text-lg">${data.name}</h3>
                            <p class="text-xs text-slate-500 mt-1 font-medium">${data.email}</p>
                            <a href="/teacher-dashboard?viewAs=${uid}" target="_blank" class="mt-6 bg-slate-50 text-slate-600 hover:bg-brand hover:text-white px-5 py-2.5 rounded-xl text-xs font-bold transition w-full shadow-sm">View Dashboard</a>
                        </div>
                    `;
                    selTeacher.innerHTML += `<option value="${uid}">${data.name}</option>`;
                }
            });

            // Update Stats
            document.getElementById("statStudents").innerText = studentCount;
            document.getElementById("statTeachers").innerText = teacherCount;
            document.getElementById("statPending").innerText = pendingCount;
            
            // Update Badge
            const badge = document.getElementById("badgeApprovals");
            if(pendingCount > 0) {
                badge.innerText = pendingCount;
                badge.classList.remove("hidden");
            } else {
                badge.classList.add("hidden");
                approvalsList.innerHTML = `<tr><td colspan="4" class="px-8 py-8 text-center text-slate-400 font-medium">No pending registration requests.</td></tr>`;
            }
        });
    }

    // Approve / Deny Logic
    document.getElementById("adminApprovalsList").addEventListener("click", async (e) => {
        if(e.target.closest('.btn-approve')) {
            const btn = e.target.closest('.btn-approve');
            const uid = btn.getAttribute("data-uid");
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
            await updateDoc(doc(db, "users", uid), { status: "approved" });
        }
        else if(e.target.closest('.btn-deny')) {
            if(confirm("Are you sure you want to deny and delete this request permanently?")) {
                const uid = e.target.closest('.btn-deny').getAttribute("data-uid");
                await deleteDoc(doc(db, "users", uid));
            }
        }
    });

    // ================= 5. TEACHER ALLOCATIONS =================
    function listenToAllocations() {
        onSnapshot(query(collection(db, "teacher_assignments"), orderBy("assignedAt", "desc")), async (snapshot) => {
            const aCont = document.getElementById("allocationsContainer");
            aCont.innerHTML = "";
            
            if(snapshot.empty) {
                aCont.innerHTML = "<p class='text-sm text-slate-400 font-medium'>No teachers allocated to sections yet.</p>"; return;
            }

            for(const docSnap of snapshot.docs) {
                const data = docSnap.data();
                // Fetch teacher name (we can optimize this later, but fine for now)
                const tDoc = await getDoc(doc(db, "users", data.teacherId));
                const tName = tDoc.exists() ? tDoc.data().name : "Unknown";
                
                aCont.innerHTML += `
                    <div class="p-4 border border-slate-100 bg-white shadow-sm rounded-2xl mb-3 flex flex-col gap-1 transition hover:shadow-md">
                        <p class="font-black text-slate-800">${data.subjectName}</p>
                        <div class="flex justify-between items-center mt-2 pt-2 border-t border-slate-50">
                            <p class="text-[10px] uppercase font-black text-slate-400"><i class="fa-solid fa-user-tie mr-1"></i> Prof. ${tName}</p>
                            <span class="bg-brand/10 text-brand px-2 py-1 rounded-md text-[10px] font-black tracking-wider">SEC ${data.sectionId}</span>
                        </div>
                    </div>
                `;
            }
        });
    }

    const allocateModal = document.getElementById("allocateModal");
    document.getElementById("btnOpenAllocate").addEventListener("click", () => allocateModal.classList.remove("hidden"));
    document.getElementById("btnCloseAllocate").addEventListener("click", () => allocateModal.classList.add("hidden"));
    
    document.getElementById("btnSaveAllocate").addEventListener("click", async () => {
        const btn = document.getElementById("btnSaveAllocate");
        const teacherId = document.getElementById("selTeacher").value;
        const sectionId = document.getElementById("selSection").value;
        const subjectName = document.getElementById("inpSubject").value.trim();

        if(!teacherId || !sectionId || !subjectName) return alert("Please fill all allocation details");
        
        btn.disabled = true;
        btn.innerText = "Saving...";

        try {
            await addDoc(collection(db, "teacher_assignments"), { teacherId, sectionId, subjectName, assignedAt: serverTimestamp() });
            allocateModal.classList.add("hidden");
            document.getElementById("inpSubject").value = "";
        } catch(error) {
            console.error(error); alert("Failed to save allocation");
        } finally {
            btn.disabled = false;
            btn.innerText = "Save Allocation";
        }
    });

    // ================= 6. LOGOUT =================
    document.getElementById("btnLogout").addEventListener("click", () => {
        signOut(auth).then(() => window.location.href = "/login");
    });
});