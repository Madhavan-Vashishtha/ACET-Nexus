import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
    
    const navbar = document.querySelector(".custom-navbar");
    if (navbar) {
        navbar.style.backgroundColor = "#0b1120";
        navbar.classList.add("navbar-dark-mode");
    }

    let userData = {};
    let semCount = 0;

    window.showToast = (msg, type='success') => {
        const cont = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `${type==='success'?'bg-emerald-500':'bg-red-500'} text-white px-5 py-3 rounded-lg shadow-lg transition-all duration-300 text-sm font-medium flex items-center gap-2 transform translate-y-10 opacity-0`;
        toast.innerHTML = `<i class="fa-solid ${type==='success'?'fa-circle-check':'fa-circle-exclamation'}"></i> ${msg}`;
        cont.appendChild(toast);
        setTimeout(() => toast.classList.remove('translate-y-10', 'opacity-0'), 10);
        setTimeout(() => { toast.classList.add('translate-y-10', 'opacity-0'); setTimeout(() => toast.remove(), 300); }, 3000);
    };

    onAuthStateChanged(auth, async (user) => {
        if (!user) return window.location.replace("/login");

        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            userData = userDoc.data();
            document.getElementById("resName").innerText = userData.name || "Student Name";
            document.getElementById("resEmail").innerText = userData.email || "-";
            document.getElementById("resPhone").innerText = userData.phone || "-";
            document.getElementById("resAddress").innerText = userData.address || "-";

            if (userData.photoURL) {
                document.getElementById("resAvatar").innerHTML = `<img src="${userData.photoURL}" class="w-full h-full object-cover">`;
            } else {
                document.getElementById("resAvatar").innerText = userData.name ? userData.name[0].toUpperCase() : "S";
            }
        }
    });

    const semContainer = document.getElementById("semestersContainer");
    document.getElementById("btnAddSem").addEventListener("click", () => {
        if(semCount >= 10) return;
        semCount++;
        const div = document.createElement("div");
        div.className = "flex items-center gap-2 sem-item";
        div.innerHTML = `
            <input type="text" class="sem-input input-box w-full py-2" placeholder="Sem ${semCount}">
            <button class="btn-remove-sem text-slate-400 hover:text-red-500 p-1 transition-colors" title="Remove"><i class="fa-solid fa-xmark"></i></button>
        `;
        semContainer.appendChild(div);
    });

    semContainer.addEventListener("click", (e) => {
        if(e.target.closest('.btn-remove-sem')) {
            e.target.closest('.sem-item').remove();
            semCount--;
            const remaining = semContainer.querySelectorAll('.sem-input');
            remaining.forEach((inp, idx) => inp.placeholder = `Sem ${idx + 1}`);
        }
    });

    const expContainer = document.getElementById("experienceContainer");
    document.getElementById("btnAddExp").addEventListener("click", () => {
        const div = document.createElement("div");
        div.className = "exp-item p-5 border border-slate-200 bg-slate-50/50 rounded-lg relative";
        div.innerHTML = `
            <button class="btn-remove-exp absolute top-4 right-4 text-slate-400 hover:text-red-500 transition-colors" title="Remove Experience"><i class="fa-solid fa-trash-can text-sm"></i></button>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 pr-6">
                <div>
                    <label class="label-text">Company</label>
                    <input type="text" class="exp-company input-box" placeholder="Company">
                </div>
                <div>
                    <label class="label-text">Role</label>
                    <input type="text" class="exp-role input-box" placeholder="Role">
                </div>
                <div>
                    <label class="label-text">Duration</label>
                    <input type="text" class="exp-duration input-box" placeholder="Duration">
                </div>
                <div>
                    <label class="label-text">Domain</label>
                    <input type="text" class="exp-topic input-box" placeholder="Domain">
                </div>
            </div>
            <div>
                <label class="label-text">Description</label>
                <textarea class="exp-desc input-box resize-none" rows="2" placeholder="Description..."></textarea>
            </div>
        `;
        expContainer.appendChild(div);
    });

    expContainer.addEventListener("click", (e) => {
        if(e.target.closest('.btn-remove-exp')) e.target.closest('.exp-item').remove();
    });

    document.getElementById("btnGenerate").addEventListener("click", async () => {
        const btn = document.getElementById("btnGenerate");
        
        const payload = {
            name: userData.name || "",
            email: userData.email || "",
            phone: userData.phone || "",
            address: userData.address || "",
            objective: document.getElementById("inpObjective").value,
            collegeName: document.getElementById("inpCollege").value,
            degree: document.getElementById("inpDegree").value,
            school12: document.getElementById("inpSchool12").value,
            perc12: document.getElementById("inpPerc12").value,
            school10: document.getElementById("inpSchool10").value,
            perc10: document.getElementById("inpPerc10").value,
            semesters: Array.from(document.querySelectorAll('.sem-input')).map(i => i.value).filter(v => v),
            experiences: Array.from(document.querySelectorAll('.exp-item')).map(item => ({
                company: item.querySelector('.exp-company').value,
                role: item.querySelector('.exp-role').value,
                duration: item.querySelector('.exp-duration').value,
                topic: item.querySelector('.exp-topic').value,
                desc: item.querySelector('.exp-desc').value
            }))
        };

        if(!payload.objective || !payload.collegeName || !payload.degree) {
            return window.showToast("Summary, College, and Degree are required!", "error");
        }

        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Generating...`;
        btn.disabled = true;

        try {
            const response = await fetch('/api/generate-resume', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (result.success) {
                document.getElementById("builderView").classList.add("hidden");
                document.getElementById("outputView").classList.remove("hidden");
                document.getElementById("generatedResumeContainer").innerHTML = result.resume_html;
                window.scrollTo(0,0);
            } else {
                window.showToast("AI Error: " + result.error, "error");
            }
        } catch (error) { 
            window.showToast("Network Error!", "error"); 
        } finally { 
            btn.innerHTML = `Generate Resume`; 
            btn.disabled = false; 
        }
    });

    document.getElementById("btnBackToEdit").addEventListener("click", () => {
        document.getElementById("outputView").classList.add("hidden");
        document.getElementById("builderView").classList.remove("hidden");
    });
});