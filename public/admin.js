const adminUsername = document.getElementById("adminUsername");
const adminPassword = document.getElementById("adminPassword");
const adminLoginBtn = document.getElementById("adminLoginBtn");
const refreshUsersBtn = document.getElementById("refreshUsersBtn");
const adminStatus = document.getElementById("adminStatus");
const usersList = document.getElementById("usersList");
const TOKEN_KEY = "qrDisplayToken";

adminLoginBtn.addEventListener("click", loginAsAdmin);
refreshUsersBtn.addEventListener("click", loadUsers);

bootstrap();

async function bootstrap() {
  await loadUsers();
}

async function loginAsAdmin() {
  const username = String(adminUsername.value || "").trim().toLowerCase();
  const password = String(adminPassword.value || "");

  if (!username || !password) {
    setStatus("Enter admin username and password.", true);
    return;
  }

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Login failed.");
    }

    if ((data.user?.role || "user") !== "admin") {
      throw new Error("This account is not an admin account.");
    }

    localStorage.setItem(TOKEN_KEY, data.token);
    window.dispatchEvent(new CustomEvent("auth-changed"));
    setStatus(`Logged in as admin: ${data.user.username}`, false);
    await loadUsers();
  } catch (error) {
    setStatus(error.message || "Admin login failed.", true);
  }
}

async function loadUsers() {
  const token = localStorage.getItem(TOKEN_KEY) || "";
  if (!token) {
    usersList.innerHTML = "<p class=\"hint\">Please login as admin first.</p>";
    return;
  }

  try {
    const response = await fetch("/api/admin/users", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
      }
      throw new Error(data.error || "Unable to load users.");
    }

    renderUsers(data);
    setStatus(`Loaded ${data.length} users.`, false);
  } catch (error) {
    usersList.innerHTML = `<p class=\"message error\">${escapeHtml(error.message || "Failed to load users.")}</p>`;
    setStatus(error.message || "Failed to load users.", true);
  }
}

function renderUsers(users) {
  if (!Array.isArray(users) || users.length === 0) {
    usersList.innerHTML = "<p class=\"hint\">No users found.</p>";
    return;
  }

  usersList.innerHTML = users.map((u) => `
    <article class="panel user-card">
      <h3>${escapeHtml(u.username)} ${u.role === "admin" ? "(admin)" : ""}</h3>
      <p class="hint">Created: ${escapeHtml(formatDate(u.createdAt))} | Uploads: ${u.uploadsCount || 0}</p>
      <div class="auth-grid">
        <label class="field">
          <span>New Password</span>
          <input id="pw-${u.id}" type="password" placeholder="Set new password" />
        </label>
      </div>
      <div class="auth-actions">
        <button type="button" onclick="adminResetPassword('${u.id}')">Reset Password</button>
        <button type="button" class="danger-btn" onclick="adminDeleteUser('${u.id}', '${escapeJs(u.username)}')">Delete User + Uploads</button>
      </div>
    </article>
  `).join("");
}

window.adminResetPassword = async function adminResetPassword(userId) {
  const token = localStorage.getItem(TOKEN_KEY) || "";
  const input = document.getElementById(`pw-${userId}`);
  const newPassword = String(input?.value || "");

  if (!newPassword) {
    setStatus("Enter a new password for reset.", true);
    return;
  }

  try {
    const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/password`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ newPassword })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Password reset failed.");
    }

    if (input) {
      input.value = "";
    }
    setStatus("Password reset successful.", false);
  } catch (error) {
    setStatus(error.message || "Password reset failed.", true);
  }
};

window.adminDeleteUser = async function adminDeleteUser(userId, username) {
  const token = localStorage.getItem(TOKEN_KEY) || "";
  const ok = window.confirm(`Delete user '${username}' and all their uploads?`);
  if (!ok) {
    return;
  }

  try {
    const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Delete failed.");
    }

    setStatus(`Deleted user and removed ${data.removedUploads || 0} uploads.`, false);
    await loadUsers();
  } catch (error) {
    setStatus(error.message || "Delete failed.", true);
  }
};

function setStatus(text, isError) {
  adminStatus.textContent = text;
  adminStatus.classList.toggle("message", true);
  adminStatus.classList.toggle("error", Boolean(isError));
}

function formatDate(value) {
  if (!value) {
    return "Unknown";
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return "Unknown";
  }
  return d.toLocaleString();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeJs(value) {
  return String(value || "").replace(/'/g, "\\'");
}
