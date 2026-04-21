// static/js/toast.js
export function showToast(message, type = "success") {
    // Check if toast container exists, else create it
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.style.cssText = "position:fixed; bottom:20px; right:20px; z-index:9999; display:flex; flex-direction:column; gap:10px;";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    const bgColor = type === "success" ? "#10b981" : type === "error" ? "#ef4444" : "#3b82f6";
    const icon = type === "success" ? "fa-check-circle" : type === "error" ? "fa-circle-exclamation" : "fa-info-circle";

    toast.style.cssText = `
        background-color: ${bgColor}; color: white;
        padding: 12px 20px; border-radius: 8px; font-family: 'Inter', sans-serif;
        font-size: 14px; font-weight: 600; box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        display: flex; align-items: center; gap: 10px;
        transform: translateY(100px); opacity: 0; transition: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    `;
    
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> ${message}`;
    container.appendChild(toast);

    // Animate In
    setTimeout(() => { toast.style.transform = "translateY(0)"; toast.style.opacity = "1"; }, 10);

    // Animate Out & Remove
    setTimeout(() => {
        toast.style.transform = "translateY(100px)"; toast.style.opacity = "0";
        setTimeout(() => { toast.remove(); }, 400);
    }, 3000);
}