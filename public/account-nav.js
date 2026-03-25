async function initAccountNav() {
  const nav = document.getElementById("appNav");
  if (!nav) {
    return;
  }

  const token = localStorage.getItem("qrDisplayToken") || "";
  let username = "Guest";
  let role = "user";

  if (token) {
    try {
      const response = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (response.ok && data?.user?.username) {
        username = data.user.username;
        role = data.user.role || "user";
      } else {
        localStorage.removeItem("qrDisplayToken");
      }
    } catch (_err) {
      localStorage.removeItem("qrDisplayToken");
    }
  }

  const adminLink = role === "admin" ? "<a href=\"/admin\">Admin</a>" : "";

  nav.innerHTML = `
    <div class="nav-inner">
      <a class="nav-brand" href="/">QR Display GIF</a>
      <nav class="nav-links">
        <a href="/">Create</a>
        <a href="/gallery">Gallery</a>
        ${adminLink}
      </nav>
      <div class="nav-user">
        <button id="navAccountBtn" class="nav-pill nav-account-btn" type="button" title="Open account panel">${escapeHtml(username)}${role === "admin" ? " (admin)" : ""}</button>
        <button id="navLogoutBtn" class="ghost-btn nav-logout ${token ? "" : "hidden"}" type="button">Logout</button>
      </div>
    </div>
  `;

  const navAccountBtn = document.getElementById("navAccountBtn");
  if (navAccountBtn) {
    navAccountBtn.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("open-account-modal"));
    });
  }

  const logoutBtn = document.getElementById("navLogoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("qrDisplayToken");
      window.dispatchEvent(new CustomEvent("auth-changed"));
      window.location.reload();
    });
  }
}

window.addEventListener("storage", (event) => {
  if (!event.key || event.key === "qrDisplayToken") {
    initAccountNav();
  }
});

window.addEventListener("auth-changed", () => {
  initAccountNav();
});

initAccountNav();

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
