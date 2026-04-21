import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
    
    let currentUserId = null;
    let currentUserRole = null;

    // Elements
    const profName = document.getElementById("profName");
    const profEmail = document.getElementById("profEmail");
    const profPhone = document.getElementById("profPhone");
    const profDob = document.getElementById("profDob");
    const profSection = document.getElementById("profSection"); // 🔥 Added
    const profAddress = document.getElementById("profAddress");
    const profBio = document.getElementById("profBio");
    const profPicUrl = document.getElementById("profPicUrl");
    
    const profileAvatar = document.getElementById("profileAvatar");
    const roleBadge = document.getElementById("roleBadge");
    const idLabel = document.getElementById("idLabel");
    const profEnrollment = document.getElementById("profEnrollment");
    const profDepartment = document.getElementById("profDepartment");
    const profJoined = document.getElementById("profJoined");
    
    const profileBar = document.getElementById("profileBar");
    const profilePercent = document.getElementById("profilePercent");
    
    const btnSaveProfile = document.getElementById("btnSaveProfile");
    const btnBackToDashboard = document.getElementById("btnBackToDashboard");

    // 🔥 Added profSection to completion fields
    const completionFields = [profName, profEmail, profPhone, profDob, profSection, profAddress, profBio, profPicUrl];

    function updateCompletion() {
        const total = completionFields.length;
        let filled = 0;
        completionFields.forEach(field => {
            if (field.value && field.value.trim() !== "") filled++;
        });
        const percent = Math.round((filled / total) * 100);
        profileBar.style.width = percent + "%";
        profilePercent.textContent = percent + "%";
        
        if (percent === 100) {
            profileBar.className = "bg-gradient-to-r from-emerald-400 to-emerald-600 h-2.5 rounded-full transition-all duration-500 shadow-sm";
            profilePercent.className = "font-black text-emerald-600";
        } else {
            profileBar.className = "bg-gradient-to-r from-brand to-indigo-400 h-2.5 rounded-full transition-all duration-500 shadow-sm";
            profilePercent.className = "font-black text-brand";
        }
    }

    completionFields.forEach(field => {
        field.addEventListener("input", updateCompletion);
    });

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUserId = user.uid;
            
            try {
                const userDoc = await getDoc(doc(db, "users", currentUserId));
                
                if(userDoc.exists()) {
                    const data = userDoc.data();
                    currentUserRole = data.role || 'student';

                    profName.value = data.name || "No Name Set";
                    profEmail.value = data.email || user.email;
                    if(data.phone) profPhone.value = data.phone;
                    if(data.dob) profDob.value = data.dob;
                    if(data.section) profSection.value = data.section; // 🔥 Load section
                    if(data.address) profAddress.value = data.address;
                    if(data.bio) profBio.value = data.bio;
                    
                    if(data.profilePic) {
                        profPicUrl.value = data.profilePic;
                        profileAvatar.src = data.profilePic;
                    } else {
                        profileAvatar.src = `https://ui-avatars.com/api/?name=${data.name || 'User'}&background=eff6ff&color=4f46e5`;
                    }

                    roleBadge.innerText = currentUserRole;
                    profJoined.innerText = data.joinedDate || new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

                    if (currentUserRole === 'admin') {
                        roleBadge.className = "bg-purple-100 text-purple-700 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border border-purple-200";
                        idLabel.innerText = "Admin ID";
                        profEnrollment.innerText = data.adminId || "ADM-001";
                        profDepartment.innerText = "Management";
                    } 
                    else if (currentUserRole === 'teacher') {
                        roleBadge.className = "bg-orange-100 text-orange-700 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border border-orange-200";
                        idLabel.innerText = "Employee ID";
                        profEnrollment.innerText = data.empId || "EMP-" + Math.floor(1000 + Math.random() * 9000);
                        profDepartment.innerText = data.department || "Computer Science";
                    } 
                    else {
                        roleBadge.className = "bg-indigo-100 text-brand px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border border-indigo-200";
                        idLabel.innerText = "Enrollment No";
                        profEnrollment.innerText = data.enrollment || "STU-" + Math.floor(10000 + Math.random() * 90000);
                        // 🔥 Show actual section from DB in the card header
                        profDepartment.innerText = data.section ? `Sec: ${data.section}` : "Please Update Section";
                    }

                    updateCompletion();
                }
            } catch (error) {
                console.error("Error fetching profile: ", error);
            }
        } else {
            window.location.href = "/login";
        }
    });

    profPicUrl.addEventListener("input", (e) => {
        const newUrl = e.target.value.trim();
        if(newUrl) {
            profileAvatar.src = newUrl;
        } else {
            profileAvatar.src = `https://ui-avatars.com/api/?name=${profName.value}&background=eff6ff&color=4f46e5`;
        }
    });

    btnSaveProfile.addEventListener("click", async () => {
        const originalText = btnSaveProfile.innerHTML;
        btnSaveProfile.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;
        btnSaveProfile.disabled = true;

        try {
            const userRef = doc(db, "users", currentUserId);
            
            // 🔥 Save section to DB
            await updateDoc(userRef, {
                phone: profPhone.value.trim(),
                dob: profDob.value,
                section: profSection.value.trim().toUpperCase(),
                address: profAddress.value.trim(),
                bio: profBio.value.trim(),
                profilePic: profPicUrl.value.trim()
            });

            btnSaveProfile.className = "bg-emerald-500 text-white px-8 py-3 rounded-xl font-bold shadow-[0_4px_15px_rgba(16,185,129,0.4)] transition flex items-center justify-center gap-2 text-sm md:text-base w-full md:w-auto";
            btnSaveProfile.innerHTML = `<i class="fa-solid fa-check"></i> Saved Successfully`;
            
            // Update the top card text immediately
            if(currentUserRole === 'student') {
                profDepartment.innerText = `Sec: ${profSection.value.trim().toUpperCase()}`;
            }
            
            setTimeout(() => {
                btnSaveProfile.className = "bg-brand text-white px-8 py-3 rounded-xl font-bold shadow-[0_4px_15px_rgba(79,70,229,0.4)] hover:bg-indigo-700 transition flex items-center justify-center gap-2 text-sm md:text-base w-full md:w-auto";
                btnSaveProfile.innerHTML = originalText;
                btnSaveProfile.disabled = false;
            }, 2000);

        } catch (error) {
            console.error(error);
            alert("Error updating profile. Please try again.");
            btnSaveProfile.innerHTML = originalText;
            btnSaveProfile.disabled = false;
        } 
    });

    btnBackToDashboard.addEventListener("click", () => {
        if (!currentUserRole) return window.location.href = "/";
        if (currentUserRole === 'admin') window.location.href = "/admin-dashboard";
        else if (currentUserRole === 'teacher') window.location.href = "/teacher-dashboard";
        else window.location.href = "/student-dashboard";
    });
});