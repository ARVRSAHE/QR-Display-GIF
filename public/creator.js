const uploadForm = document.getElementById("uploadForm");
const gifInput = document.getElementById("gifInput");
const gifRows = document.getElementById("gifRows");
const addGifInputBtn = document.getElementById("addGifInputBtn");
const submitBtn = document.getElementById("submitBtn");
const formMessage = document.getElementById("formMessage");
const result = document.getElementById("result");
const qrImage = document.getElementById("qrImage");
const viewerUrlInput = document.getElementById("viewerUrl");
const copyBtn = document.getElementById("copyBtn");
const expiresAt = document.getElementById("expiresAt");
const qrDark = document.getElementById("qrDark");
const qrLight = document.getElementById("qrLight");
const authUsername = document.getElementById("authUsername");
const authPassword = document.getElementById("authPassword");
const authPasswordConfirm = document.getElementById("authPasswordConfirm");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const toggleResetBtn = document.getElementById("toggleResetBtn");
const resetPanel = document.getElementById("resetPanel");
const currentPassword = document.getElementById("currentPassword");
const resetNewPassword = document.getElementById("resetNewPassword");
const resetNewPasswordConfirm = document.getElementById("resetNewPasswordConfirm");
const confirmResetBtn = document.getElementById("confirmResetBtn");
const registerBtn = document.getElementById("registerBtn");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const authStatus = document.getElementById("authStatus");
const accountQuickStatus = document.getElementById("accountQuickStatus");
const openAccountBtn = document.getElementById("openAccountBtn");
const closeAccountModalBtn = document.getElementById("closeAccountModalBtn");
const accountModal = document.getElementById("accountModal");
const authTabLogin = document.getElementById("authTabLogin");
const authTabRegister = document.getElementById("authTabRegister");
const authTabPassword = document.getElementById("authTabPassword");
const confirmPasswordField = document.getElementById("confirmPasswordField");
const authPrimaryActions = document.getElementById("authPrimaryActions");
const authSecondaryActions = document.getElementById("authSecondaryActions");
const scanabilityBadge = document.getElementById("scanabilityBadge");
const toggleGroupGifsBtn = document.getElementById("toggleGroupGifsBtn");
const groupGifsSection = document.getElementById("groupGifsSection");
const groupGifsStatus = document.getElementById("groupGifsStatus");
const groupGifsList = document.getElementById("groupGifsList");
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const TOKEN_KEY = "qrDisplayToken";
let currentUser = null;
let currentAuthView = "login";
let groupGifsLoadedOnce = false;

registerBtn.addEventListener("click", register);
loginBtn.addEventListener("click", login);
logoutBtn.addEventListener("click", logout);
forgotPasswordBtn.addEventListener("click", requestPasswordReset);
toggleResetBtn.addEventListener("click", toggleResetPanel);
confirmResetBtn.addEventListener("click", confirmPasswordReset);
initAccountModal();
initQrPresets();
initAuthTabs();
initScanabilityWatchers();
initGroupGifsToggle();
initAddMoreGifs();

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const token = getToken();
  if (!token) {
    setAuthStatus("Login required to create/manage your QR items.");
    setMessage("Please login first. Creating new GIF QR codes is owner-only.", true);
    return;
  }

  const rows = getSelectedGifRows();
  if (!rows.length) {
    setMessage("Please choose a GIF file.", true);
    return;
  }

  for (const row of rows) {
    const file = row.file;
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setMessage(`'${file.name}' is too large. Max allowed size is 25 MB.`, true);
      return;
    }
  }

  submitBtn.disabled = true;
  setMessage(`Uploading ${rows.length} GIF${rows.length === 1 ? "" : "s"}...`, false);

  try {
    const dark = String(qrDark?.value || "#221D23");
    const light = String(qrLight?.value || "#D0E37F");
    const groupId = rows.length > 1
      ? `grp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
      : "";
    let latestData = null;

    for (let i = 0; i < rows.length; i += 1) {
      const file = rows[i].file;
      const overlayText = rows[i].overlayText;
      setMessage(`Uploading ${i + 1}/${rows.length}: ${file.name}`, false);

      const body = new FormData();
      body.append("gif", file, file.name);
      body.append("overlayText", overlayText);
      body.append("qrDark", dark);
      body.append("qrLight", light);
      if (groupId) {
        body.append("groupId", groupId);
      }

      const response = await fetch("/api/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        body
      });
      const raw = await response.text();
      const data = tryParseJson(raw);

      if (!response.ok) {
        if (response.status === 401) {
          clearToken();
          updateAuthStatus(null);
          throw new Error("Your session expired. Please login again.");
        }
        if (response.status === 413) {
          throw new Error(`'${file.name}' is too large (413). Use a smaller GIF (<= 25 MB).`);
        }
        if (response.status === 403) {
          throw new Error("You do not have permission to upload with this account.");
        }
        throw new Error(data.error || `Upload failed for '${file.name}' (${response.status}).`);
      }

      if (!data?.id) {
        throw new Error(`Upload for '${file.name}' succeeded but response was invalid.`);
      }

      latestData = data;
    }

    if (!latestData?.id) {
      throw new Error("Upload finished but no result was returned.");
    }

    const data = latestData;
    const viewerUrl = groupId
      ? `${window.location.origin}/scan?target=${encodeURIComponent(`g:${groupId}`)}`
      : (data.viewerUrl || `${window.location.origin}${data.viewerPath}`);

    qrImage.src = groupId
      ? `/api/group-qr/${encodeURIComponent(groupId)}?t=${Date.now()}`
      : `/api/qr/${encodeURIComponent(data.id)}?t=${Date.now()}`;
    viewerUrlInput.value = viewerUrl;
    expiresAt.textContent = "Expires: Never (permanent for now)";
    result.classList.remove("hidden");
    setMessage(`Done. Uploaded ${rows.length} GIF${rows.length === 1 ? "" : "s"}.`, false);

    resetGifRows();

    if (groupGifsSection && !groupGifsSection.classList.contains("hidden")) {
      await loadGroupGifs();
    }
  } catch (error) {
    setMessage(error.message || "Something went wrong.", true);
  } finally {
    submitBtn.disabled = false;
  }
});

copyBtn.addEventListener("click", async () => {
  const value = viewerUrlInput.value;
  if (!value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    copyBtn.textContent = "Copied";
    setTimeout(() => {
      copyBtn.textContent = "Copy URL";
    }, 1200);
  } catch (_err) {
    setMessage("Unable to copy. Please copy manually.", true);
  }
});

async function register() {
  const username = String(authUsername.value || "").trim().toLowerCase();
  const password = String(authPassword.value || "");
  const confirm = String(authPasswordConfirm.value || "");
  if (!username || !password) {
    setAuthStatus("Enter username and password to register.");
    setMessage("Enter username and password to register.", true);
    return;
  }
  if (password !== confirm) {
    setAuthStatus("Password confirmation did not match.");
    setMessage("Password and confirmation do not match.", true);
    return;
  }

  try {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Registration failed.");
    }

    setToken(data.token);
    updateAuthStatus(data.user);
    setAuthStatus(`Welcome, ${data.user.username}`);
    setMessage("Account created and logged in.", false);
  } catch (error) {
    setAuthStatus(error.message || "Registration failed.");
    setMessage(error.message || "Registration failed.", true);
  }
}

async function login() {
  const username = String(authUsername.value || "").trim().toLowerCase();
  const password = String(authPassword.value || "");
  if (!username || !password) {
    setAuthStatus("Enter username and password to login.");
    setMessage("Enter username and password to login.", true);
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

    setToken(data.token);
    updateAuthStatus(data.user);
    setAuthStatus(`Welcome back, ${data.user.username}`);
    setMessage("Logged in successfully.", false);
  } catch (error) {
    setAuthStatus(error.message || "Login failed.");
    setMessage(error.message || "Login failed.", true);
  }
}

function logout() {
  clearToken();
  updateAuthStatus(null);
  setAuthStatus("Logged out. Login to create or manage QR items.");
  setMessage("Logged out.", false);
}

async function requestPasswordReset() {
  setAuthStatus("Forgot password: please contact admin for account recovery.");
  setMessage("Please contact admin to reset your account password.", true);
}

async function confirmPasswordReset() {
  const token = getToken();
  const current = String(currentPassword.value || "");
  const newPassword = String(resetNewPassword.value || "");
  const confirmNew = String(resetNewPasswordConfirm.value || "");

  if (!token) {
    setAuthStatus("Login required before changing password.");
    setMessage("Please login first.", true);
    return;
  }

  if (!current || !newPassword) {
    setAuthStatus("Current and new password are required.");
    setMessage("Current and new password are required.", true);
    return;
  }

  if (newPassword !== confirmNew) {
    setAuthStatus("New password confirmation mismatch.");
    setMessage("New password and confirmation do not match.", true);
    return;
  }

  try {
    const response = await fetch("/api/auth/password/change", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        currentPassword: current,
        newPassword
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Password change failed.");
    }

    currentPassword.value = "";
    resetNewPassword.value = "";
    resetNewPasswordConfirm.value = "";
    if (resetPanel) {
      resetPanel.classList.add("hidden");
    }
    setAuthStatus("Password updated successfully.");
    setMessage("Password updated successfully.", false);
  } catch (error) {
    setAuthStatus(error.message || "Password change failed.");
    setMessage(error.message || "Password change failed.", true);
  }
}

function toggleResetPanel() {
  if (!currentUser) {
    setAuthStatus("Login first to reset password.");
    setMessage("Login first to reset password.", true);
    return;
  }

  if (resetPanel) {
    resetPanel.classList.toggle("hidden");
    if (!resetPanel.classList.contains("hidden")) {
      currentPassword?.focus();
    }
  }
}

function initQrPresets() {
  const presetButtons = document.querySelectorAll('.qr-preset-btn[data-preset-scope="create"]');
  presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const dark = String(button.dataset.dark || "").toUpperCase();
      const light = String(button.dataset.light || "").toUpperCase();
      if (qrDark && /^#[0-9A-F]{6}$/.test(dark)) {
        qrDark.value = dark;
      }
      if (qrLight && /^#[0-9A-F]{6}$/.test(light)) {
        qrLight.value = light;
      }
      updateCreateScanability();
    });
  });

  updateCreateScanability();
}

async function bootstrapAuth() {
  const token = getToken();
  if (!token) {
    updateAuthStatus(null);
    return;
  }

  try {
    const response = await fetch("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (!response.ok) {
      clearToken();
      updateAuthStatus(null);
      return;
    }

    updateAuthStatus(data.user);
  } catch (_err) {
    clearToken();
    updateAuthStatus(null);
  }
}

function updateAuthStatus(user) {
  currentUser = user || null;
  const summary = currentUser
    ? `Logged in as ${currentUser.username}${currentUser.role === "admin" ? " (admin)" : ""}`
    : "Not logged in.";

  if (!currentUser && resetPanel) {
    resetPanel.classList.add("hidden");
  }

  if (currentAuthView === "password") {
    applyAuthView("password");
  }

  if (currentUser) {
    authStatus.textContent = summary;
    if (accountQuickStatus) {
      accountQuickStatus.textContent = summary;
    }
    return;
  }

  authStatus.textContent = summary;
  if (accountQuickStatus) {
    accountQuickStatus.textContent = summary;
  }

  if (!currentUser) {
    resetGroupGifsState();
  }
}

function setAuthStatus(text) {
  authStatus.textContent = text;
  if (accountQuickStatus) {
    accountQuickStatus.textContent = text;
  }
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  resetGroupGifsState();
}

function setMessage(text, isError) {
  formMessage.textContent = text;
  formMessage.classList.toggle("error", Boolean(isError));
}

function initGroupGifsToggle() {
  if (!toggleGroupGifsBtn || !groupGifsSection) {
    return;
  }

  toggleGroupGifsBtn.addEventListener("click", async () => {
    const shouldOpen = groupGifsSection.classList.contains("hidden");
    groupGifsSection.classList.toggle("hidden", !shouldOpen);
    toggleGroupGifsBtn.setAttribute("aria-expanded", String(shouldOpen));

    if (shouldOpen && (!groupGifsLoadedOnce || !groupGifsList?.children.length)) {
      await loadGroupGifs();
    }
  });
}

function initAddMoreGifs() {
  if (!addGifInputBtn || !gifRows) {
    return;
  }

  addGifInputBtn.addEventListener("click", () => {
    const rowIndex = gifRows.querySelectorAll(".gif-upload-row").length + 1;
    const row = document.createElement("div");
    row.className = "gif-upload-row";
    row.setAttribute("data-row-index", String(rowIndex));
    row.innerHTML = `
      <input id="gifInput${rowIndex}" name="gif" type="file" accept="image/gif" required />
      <input class="gif-text-input" name="overlayTextItem" type="text" maxlength="60" placeholder="Top text for GIF ${rowIndex} (optional)" />
      <button type="button" class="ghost-btn remove-gif-row-btn" aria-label="Remove GIF ${rowIndex}">Remove</button>
    `;

    const removeBtn = row.querySelector(".remove-gif-row-btn");
    removeBtn?.addEventListener("click", () => {
      row.remove();
      refreshGifRowPlaceholders();
    });

    gifRows.appendChild(row);
    const fileInput = row.querySelector('input[name="gif"]');
    fileInput?.focus();
  });
}

function refreshGifRowPlaceholders() {
  if (!gifRows) {
    return;
  }

  const rows = Array.from(gifRows.querySelectorAll(".gif-upload-row"));
  rows.forEach((row, index) => {
    const labelIndex = index + 1;
    row.setAttribute("data-row-index", String(labelIndex));
    const textInput = row.querySelector('.gif-text-input');
    if (textInput) {
      textInput.placeholder = `Top text for GIF ${labelIndex} (optional)`;
    }
    const removeBtn = row.querySelector(".remove-gif-row-btn");
    if (removeBtn) {
      removeBtn.setAttribute("aria-label", `Remove GIF ${labelIndex}`);
    }
  });
}

function getSelectedGifRows() {
  if (!gifRows) {
    const fallbackFile = gifInput?.files?.[0];
    return fallbackFile ? [{ file: fallbackFile, overlayText: "" }] : [];
  }

  return Array.from(gifRows.querySelectorAll(".gif-upload-row"))
    .map((row) => ({
      file: row.querySelector('input[name="gif"]')?.files?.[0],
      overlayText: String(row.querySelector('.gif-text-input')?.value || "").trim().slice(0, 60)
    }))
    .filter((row) => Boolean(row.file));
}

function resetGifRows() {
  if (!gifRows) {
    if (gifInput) {
      gifInput.value = "";
    }
    return;
  }

  const firstRow = gifRows.querySelector(".gif-upload-row");
  if (!firstRow) {
    return;
  }

  const firstFile = firstRow.querySelector('input[name="gif"]');
  const firstText = firstRow.querySelector('.gif-text-input');
  if (firstFile) {
    firstFile.value = "";
    firstFile.required = true;
  }
  if (firstText) {
    firstText.value = "";
  }

  gifRows.innerHTML = "";
  gifRows.appendChild(firstRow);
  refreshGifRowPlaceholders();
}

async function loadGroupGifs() {
  if (!groupGifsStatus || !groupGifsList) {
    return;
  }

  const token = getToken();
  if (!token) {
    groupGifsStatus.textContent = "Login to view your grouped GIF uploads.";
    groupGifsList.innerHTML = "";
    groupGifsLoadedOnce = false;
    return;
  }

  groupGifsStatus.textContent = "Loading grouped uploads...";

  try {
    const response = await fetch("/api/items", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        clearToken();
        updateAuthStatus(null);
      }
      throw new Error(data.error || "Unable to load grouped uploads.");
    }

    renderGroupGifs(Array.isArray(data) ? data : []);
    groupGifsLoadedOnce = true;
  } catch (error) {
    groupGifsStatus.textContent = error.message || "Failed to load grouped uploads.";
    groupGifsList.innerHTML = "";
  }
}

function renderGroupGifs(items) {
  if (!groupGifsStatus || !groupGifsList) {
    return;
  }

  if (!items.length) {
    groupGifsStatus.textContent = "No uploads found yet. Upload your first GIF above.";
    groupGifsList.innerHTML = "";
    return;
  }

  const sorted = [...items].sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return bTime - aTime;
  });

  const groups = groupItems(sorted);

  groupGifsStatus.textContent = `Showing ${sorted.length} upload${sorted.length === 1 ? "" : "s"} in ${groups.length} group${groups.length === 1 ? "" : "s"}.`;
  groupGifsList.innerHTML = groups.map((group) => {
    const groupViewerUrl = group.groupId
      ? `${window.location.origin}/scan?target=${encodeURIComponent(`g:${group.groupId}`)}`
      : "";
    const groupQrUrl = group.groupId
      ? `/api/group-qr/${encodeURIComponent(group.groupId)}?t=${Date.now()}`
      : "";
    const groupLabel = group.groupId
      ? `Grouped Upload (${group.items.length} GIF${group.items.length === 1 ? "" : "s"})`
      : "Single Upload";

    const itemsHtml = group.items.map((item) => {
      const viewerUrl = `${window.location.origin}/scan?target=${encodeURIComponent(`v:${item.id}`)}`;
      const safeText = escapeHtml(item.overlayText || "No top text");
      const created = escapeHtml(formatDate(item.createdAt));
      const scanCount = Number(item.scanCount || 0);
      return `
      <article class="group-gif-card">
        <div class="group-gif-preview">
          <img src="${item.gifUrl}" alt="Uploaded GIF ${safeText}" loading="lazy" />
        </div>
        <div class="group-gif-details">
          <p class="group-gif-title">${safeText}</p>
          <p class="hint">Created: ${created}</p>
          <p class="hint">Scans: ${scanCount}</p>
          <label class="field compact-field">
            <span>Viewer URL</span>
            <input type="text" value="${viewerUrl}" readonly />
          </label>
        </div>
        <div class="group-gif-qr">
          <img src="/api/qr/${encodeURIComponent(item.id)}?t=${Date.now()}" alt="QR for upload ${safeText}" loading="lazy" />
        </div>
      </article>
    `;
    }).join("");

    const groupMetaHtml = group.groupId
      ? `
        <article class="group-gif-card group-master-card">
          <div class="group-gif-preview group-master-preview">
            <img src="${group.items[0].gifUrl}" alt="Group preview" loading="lazy" />
          </div>
          <div class="group-gif-details">
            <p class="group-gif-title">Single QR for this group</p>
            <label class="field compact-field">
              <span>Group Viewer URL</span>
              <input type="text" value="${groupViewerUrl}" readonly />
            </label>
          </div>
          <div class="group-gif-qr">
            <img src="${groupQrUrl}" alt="Group QR" loading="lazy" />
          </div>
        </article>
      `
      : "";

    return `
      <section class="upload-group">
        <p class="upload-group-head">${groupLabel}</p>
        ${groupMetaHtml}
        <div class="group-gifs-grid">${itemsHtml}</div>
      </section>
    `;
  }).join("");
}

function groupItems(items) {
  const map = new Map();

  for (const item of items) {
    const key = item.groupId || `single-${item.id}`;
    if (!map.has(key)) {
      map.set(key, {
        groupId: item.groupId || "",
        items: []
      });
    }
    map.get(key).items.push(item);
  }

  return Array.from(map.values());
}

function resetGroupGifsState() {
  if (groupGifsSection) {
    groupGifsSection.classList.add("hidden");
  }
  if (toggleGroupGifsBtn) {
    toggleGroupGifsBtn.setAttribute("aria-expanded", "false");
  }
  if (groupGifsStatus) {
    groupGifsStatus.textContent = "Open Group GIFs to view your uploads.";
  }
  if (groupGifsList) {
    groupGifsList.innerHTML = "";
  }
  groupGifsLoadedOnce = false;
}

function initAccountModal() {
  if (!accountModal) {
    return;
  }

  if (openAccountBtn) {
    openAccountBtn.addEventListener("click", openAccountModal);
  }

  if (closeAccountModalBtn) {
    closeAccountModalBtn.addEventListener("click", closeAccountModal);
  }

  accountModal.addEventListener("click", (event) => {
    if (event.target === accountModal || event.target.classList.contains("modal-backdrop")) {
      closeAccountModal();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !accountModal.classList.contains("hidden")) {
      closeAccountModal();
    }
  });

  window.addEventListener("open-account-modal", openAccountModal);
}

function openAccountModal() {
  if (!accountModal) {
    return;
  }
  accountModal.classList.remove("hidden");
  applyAuthView(currentAuthView);
  authUsername?.focus();
}

function closeAccountModal() {
  if (!accountModal) {
    return;
  }
  accountModal.classList.add("hidden");
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch (_err) {
    return {};
  }
}

function initAuthTabs() {
  if (authTabLogin) {
    authTabLogin.addEventListener("click", () => applyAuthView("login"));
  }
  if (authTabRegister) {
    authTabRegister.addEventListener("click", () => applyAuthView("register"));
  }
  if (authTabPassword) {
    authTabPassword.addEventListener("click", () => applyAuthView("password"));
  }

  applyAuthView("login");
}

function applyAuthView(view) {
  currentAuthView = view;
  const isLogin = view === "login";
  const isRegister = view === "register";
  const isPassword = view === "password";

  authTabLogin?.classList.toggle("is-active", isLogin);
  authTabRegister?.classList.toggle("is-active", isRegister);
  authTabPassword?.classList.toggle("is-active", isPassword);

  confirmPasswordField?.classList.toggle("hidden", !isRegister);
  registerBtn?.classList.toggle("hidden", !isRegister);
  loginBtn?.classList.toggle("hidden", !isLogin);

  const canLogout = Boolean(currentUser);
  logoutBtn?.classList.toggle("hidden", !canLogout);

  authPrimaryActions?.classList.remove("hidden");
  authSecondaryActions?.classList.toggle("hidden", isRegister);

  forgotPasswordBtn?.classList.toggle("hidden", !isLogin);
  toggleResetBtn?.classList.toggle("hidden", !isPassword);

  if (isPassword) {
    if (currentUser) {
      resetPanel?.classList.remove("hidden");
    } else {
      resetPanel?.classList.add("hidden");
      setAuthStatus("Login first to change password.");
    }
  } else {
    resetPanel?.classList.add("hidden");
  }
}

function initScanabilityWatchers() {
  qrDark?.addEventListener("input", updateCreateScanability);
  qrLight?.addEventListener("input", updateCreateScanability);
  updateCreateScanability();
}

function updateCreateScanability() {
  if (!scanabilityBadge || !qrDark || !qrLight) {
    return;
  }

  updateScanabilityBadge(scanabilityBadge, qrDark.value, qrLight.value);
}

function updateScanabilityBadge(badge, dark, light) {
  const ratio = contrastRatio(dark, light);
  const label = ratio >= 4.5 ? "Good" : ratio >= 3 ? "Fair" : "Risky";
  badge.textContent = `Scanability: ${label} (${ratio.toFixed(2)}:1 contrast)`;
  badge.classList.toggle("scan-good", label === "Good");
  badge.classList.toggle("scan-fair", label === "Fair");
  badge.classList.toggle("scan-risky", label === "Risky");
}

function contrastRatio(hexA, hexB) {
  const lumA = relativeLuminance(hexToRgb(hexA));
  const lumB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

function hexToRgb(hex) {
  const clean = String(hex || "").replace("#", "");
  if (!/^[0-9A-Fa-f]{6}$/.test(clean)) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
}

function relativeLuminance(rgb) {
  const norm = [rgb.r, rgb.g, rgb.b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * norm[0] + 0.7152 * norm[1] + 0.0722 * norm[2];
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

bootstrapAuth();
