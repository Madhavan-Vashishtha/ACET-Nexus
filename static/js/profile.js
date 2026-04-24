import { auth, db } from "./firebase.js";
import { onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const storage = getStorage();

document.addEventListener("DOMContentLoaded", () => {
    let currentUserRole = null;

    const navbar = document.querySelector(".custom-navbar");
    if (navbar) {
        navbar.style.backgroundColor = "#0b1120"; // Dark BG
        navbar.classList.add("navbar-dark-mode");
        navbar.classList.remove("navbar-light-mode");
    }

    // Toast Notification System
    window.showToast = (msg, type='success') => {
        const cont = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        const bg = type === 'success' ? 'bg-emerald-500' : 'bg-red-500';
        toast.className = `${bg} text-white px-6 py-3 rounded-2xl shadow-xl transition-all duration-300 text-sm font-bold flex items-center gap-3 transform translate-y-10 opacity-0`;
        toast.innerHTML = `<i class="fa-solid ${type==='success'?'fa-circle-check':'fa-circle-exclamation'}"></i> ${msg}`;
        cont.appendChild(toast);
        setTimeout(() => toast.classList.remove('translate-y-10', 'opacity-0'), 10);
        setTimeout(() => { toast.classList.add('translate-y-10', 'opacity-0'); setTimeout(() => toast.remove(), 300); }, 3000);
    };

    onAuthStateChanged(auth, async (user) => {
        if (!user) return window.location.replace("/login");

        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            currentUserRole = data.role;
            setupUI(data);
        }
    });

    function setupUI(data) {
        document.getElementById("userNameDisplay").innerText = data.name || "User";
        document.getElementById("userRoleBadge").innerText = data.role;
        document.getElementById("inpFullName").value = data.name || "";
        document.getElementById("inpEmail").value = data.email || "";
        
        document.getElementById("inpPhone").value = data.phone || "";
        document.getElementById("inpAddress").value = data.address || "";

        const avatarBox = document.getElementById("profileImageDisplay");
        if (data.photoURL) {
            avatarBox.innerHTML = `<img src="${data.photoURL}" class="w-full h-full object-cover">`;
        } else {
            avatarBox.innerText = data.name ? data.name[0].toUpperCase() : "U";
        }

        const sFields = document.getElementById("studentFields");
        const tFields = document.getElementById("teacherFields");
        const aFields = document.getElementById("adminFields");

        if (currentUserRole === "student") {
            sFields.classList.remove("hidden");
            document.getElementById("inpEnrollment").value = data.enrollment || "";
            document.getElementById("inpRollNo").value = data.rollNo || "";
            document.getElementById("inpRegNo").value = data.regNo || "";
        } else if (currentUserRole === "teacher") {
            tFields.classList.remove("hidden");
            document.getElementById("inpDept").value = data.department || "";
        } else if (currentUserRole === "admin") {
            aFields.classList.remove("hidden");
        }
    }

    document.getElementById("profilePicInput").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const btn = document.getElementById("btnSaveProfile");
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Uploading...`;

        try {
            const picRef = ref(storage, `profiles/${auth.currentUser.uid}_${Date.now()}`);
            await uploadBytes(picRef, file);
            const url = await getDownloadURL(picRef);
            
            await updateDoc(doc(db, "users", auth.currentUser.uid), { photoURL: url });
            document.getElementById("profileImageDisplay").innerHTML = `<img src="${url}" class="w-full h-full object-cover">`;
            window.showToast("Profile photo updated!");
        } catch (err) {
            window.showToast("Failed to upload photo", "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save Profile`;
        }
    });

    document.getElementById("btnSaveProfile").addEventListener("click", async () => {
        const btn = document.getElementById("btnSaveProfile");
        const newName = document.getElementById("inpFullName").value.trim();
        if (!newName) return window.showToast("Name is required", "error");

        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;

        const updatePayload = { 
            name: newName,
            phone: document.getElementById("inpPhone").value.trim(),
            address: document.getElementById("inpAddress").value.trim()
        };

        if (currentUserRole === "student") {
            updatePayload.enrollment = document.getElementById("inpEnrollment").value.trim();
            updatePayload.rollNo = document.getElementById("inpRollNo").value.trim();
            updatePayload.regNo = document.getElementById("inpRegNo").value.trim();
        } else if (currentUserRole === "teacher") {
            updatePayload.department = document.getElementById("inpDept").value.trim();
        }

        try {
            await updateDoc(doc(db, "users", auth.currentUser.uid), updatePayload);
            document.getElementById("userNameDisplay").innerText = newName;
            window.showToast("Profile saved successfully!");
        } catch (err) {
            window.showToast("Save failed", "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save Profile`;
        }
    });

    document.getElementById("btnResetPassword").addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        const email = auth.currentUser.email;

        if(btn.getAttribute('data-confirm') !== 'true') {
            btn.setAttribute('data-confirm', 'true');
            
            const originalHTML = btn.innerHTML;
            btn.setAttribute('data-original', originalHTML);
            
            btn.innerHTML = `<i class="fa-solid fa-question"></i> Click again to confirm reset`;
            btn.classList.replace('text-slate-600', 'text-amber-500');
            btn.classList.replace('border-slate-200', 'border-amber-200');
            
            setTimeout(() => {
                if(btn.getAttribute('data-confirm') === 'true') {
                    btn.removeAttribute('data-confirm');
                    btn.innerHTML = btn.getAttribute('data-original');
                    btn.classList.replace('text-amber-500', 'text-slate-600');
                    btn.classList.replace('border-amber-200', 'border-slate-200');
                }
            }, 3000);
            return;
        }

        btn.removeAttribute('data-confirm');
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sending link...`;
        btn.disabled = true;

        try {
            await sendPasswordResetEmail(auth, email);
            window.showToast("Reset link sent! Check your inbox.");
        } catch (err) {
            window.showToast("Failed to send reset link", "error");
        } finally {
            btn.innerHTML = btn.getAttribute('data-original');
            btn.classList.replace('text-amber-500', 'text-slate-600');
            btn.classList.replace('border-amber-200', 'border-slate-200');
            btn.disabled = false;
        }
    });

    document.getElementById("btnBackToDash").addEventListener("click", () => {
        if (!currentUserRole) return window.location.href = "/";
        const routes = {
            admin: "/admin-dashboard",
            teacher: "/teacher-dashboard",
            student: "/student-dashboard"
        };
        window.location.href = routes[currentUserRole] || "/";
    });
});