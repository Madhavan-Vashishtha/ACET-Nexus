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
    const profPicUrl = document.getElementById("profPicUrl");
    const profileAvatar = document.getElementById("profileAvatar");
    const roleBadge = document.getElementById("roleBadge");
    const btnSaveProfile = document.getElementById("btnSaveProfile");
    const btnBackToDashboard = document.getElementById("btnBackToDashboard");

    // 1. Auth & Data Fetch
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUserId = user.uid;
            
            try {
                const userDoc = await getDoc(doc(db, "users", currentUserId));
                
                if(userDoc.exists()) {
                    const data = userDoc.data();
                    currentUserRole = data.role;

                    // Populate Data
                    profName.value = data.name || "No Name Set";
                    profEmail.value = data.email || user.email;
                    roleBadge.innerText = currentUserRole;

                    // Set editable fields if they exist
                    if(data.phone) profPhone.value = data.phone;
                    if(data.profilePic) {
                        profPicUrl.value = data.profilePic;
                        profileAvatar.src = data.profilePic;
                    } else {
                        // Fallback avatar based on name
                        profileAvatar.src = `https://ui-avatars.com/api/?name=${data.name}&background=eff6ff&color=1d4ed8`;
                    }

                    // Dynamically set background color of badge based on role
                    if(currentUserRole === 'admin') roleBadge.className = "bg-purple-100 text-purple-700 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border border-purple-200";
                    if(currentUserRole === 'teacher') roleBadge.className = "bg-orange-100 text-orange-700 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border border-orange-200";

                }
            } catch (error) {
                console.error("Error fetching profile: ", error);
                alert("Failed to load profile data.");
            }
        } else {
            window.location.href = "/login";
        }
    });

    // 2. Real-time Avatar Preview Update
    profPicUrl.addEventListener("input", (e) => {
        const newUrl = e.target.value.trim();
        if(newUrl) {
            profileAvatar.src = newUrl;
        } else {
            profileAvatar.src = `https://ui-avatars.com/api/?name=${profName.value}&background=eff6ff&color=1d4ed8`;
        }
    });

    // 3. Save Profile Updates
    btnSaveProfile.addEventListener("click", async () => {
        const newPhone = profPhone.value.trim();
        const newPicUrl = profPicUrl.value.trim();

        // Basic UI loading state
        const originalText = btnSaveProfile.innerHTML;
        btnSaveProfile.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;
        btnSaveProfile.disabled = true;

        try {
            const userRef = doc(db, "users", currentUserId);
            
            await updateDoc(userRef, {
                phone: newPhone,
                profilePic: newPicUrl
            });

            alert("Profile updated successfully!");
        } catch (error) {
            console.error(error);
            alert("Error updating profile.");
        } finally {
            // Restore button
            btnSaveProfile.innerHTML = originalText;
            btnSaveProfile.disabled = false;
        }
    });

    // 4. Back to Dashboard Router
    btnBackToDashboard.addEventListener("click", () => {
        if (!currentUserRole) return;
        
        if (currentUserRole === 'admin') {
            window.location.href = "/admin-dashboard"; // Ensure these match your Flask routes
        } else if (currentUserRole === 'teacher') {
            window.location.href = "/teacher-dashboard";
        } else if (currentUserRole === 'student') {
            window.location.href = "/student-dashboard";
        } else {
            window.location.href = "/dashboard";
        }
    });
});