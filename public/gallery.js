const galleryContainer = document.getElementById("galleryContainer");
const noItemsMessage = document.getElementById("noItemsMessage");
const qrModal = document.getElementById("qrModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const copyBtn = document.getElementById("copyBtn");
const qrImage = document.getElementById("qrImage");
const viewerUrl = document.getElementById("viewerUrl");
const modalTitle = document.getElementById("modalTitle");
const scanCountInfo = document.getElementById("scanCountInfo");
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
const managePanel = document.getElementById("managePanel");
const editOverlayText = document.getElementById("editOverlayText");
const editQrDark = document.getElementById("editQrDark");
const editQrLight = document.getElementById("editQrLight");
const saveBtn = document.getElementById("saveBtn");
const regenQrBtn = document.getElementById("regenQrBtn");
const deleteBtn = document.getElementById("deleteBtn");
const manageMessage = document.getElementById("manageMessage");
const editScanabilityBadge = document.getElementById("editScanabilityBadge");
const TOKEN_KEY = "qrDisplayToken";

let allItems = [];
let currentUser = null;
let selectedItem = null;
let selectedGroup = null;
let currentAuthView = "login";

init();

function init() {
  closeModalBtn.addEventListener("click", closeModal);
  qrModal.addEventListener("click", (e) => {
    if (e.target === qrModal) closeModal();
  });
  copyBtn.addEventListener("click", copyUrl);
  registerBtn.addEventListener("click", register);
  loginBtn.addEventListener("click", login);
  logoutBtn.addEventListener("click", logout);
  forgotPasswordBtn.addEventListener("click", requestPasswordReset);
  toggleResetBtn.addEventListener("click", toggleResetPanel);
  confirmResetBtn.addEventListener("click", confirmPasswordReset);
  saveBtn.addEventListener("click", saveChanges);
  regenQrBtn.addEventListener("click", regenerateQr);
  deleteBtn.addEventListener("click", deleteItem);
  initAccountModal();
  initEditQrPresets();
  initAuthTabs();
  initScanabilityWatchers();
  bootstrapAuth();
}

async function bootstrapAuth() {
  const token = getToken();
  if (!token) {
    updateAuthStatus(null);
    loadGallery();
    return;
  }

  try {
    const response = await fetch("/api/auth/me", {
      headers: authHeaders(token)
    });
    const data = await response.json();
    if (!response.ok) {
      clearToken();
      updateAuthStatus(null);
      loadGallery();
      return;
    }

    updateAuthStatus(data.user);
    loadGallery();
  } catch (_err) {
    clearToken();
    updateAuthStatus(null);
    loadGallery();
  }
}

async function register() {
  const username = String(authUsername.value || "").trim().toLowerCase();
  const password = String(authPassword.value || "");
  const confirm = String(authPasswordConfirm.value || "");
  if (!username || !password) {
    setAuthStatus("Enter username and password first.");
    return;
  }
  if (password !== confirm) {
    setAuthStatus("Password and confirmation do not match.");
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
    await loadGallery();
  } catch (error) {
    setAuthStatus(error.message || "Registration failed.");
  }
}

async function login() {
  const username = String(authUsername.value || "").trim().toLowerCase();
  const password = String(authPassword.value || "");
  if (!username || !password) {
    setAuthStatus("Enter username and password first.");
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
    await loadGallery();
  } catch (error) {
    setAuthStatus(error.message || "Login failed.");
  }
}

async function requestPasswordReset() {
  setAuthStatus("Forgot password: please contact admin for account recovery.");
}

async function confirmPasswordReset() {
  const token = getToken();
  const current = String(currentPassword.value || "");
  const newPassword = String(resetNewPassword.value || "");
  const confirmNew = String(resetNewPasswordConfirm.value || "");

  if (!token) {
    setAuthStatus("Login required before changing password.");
    return;
  }

  if (!current || !newPassword) {
    setAuthStatus("Current and new password are required.");
    return;
  }
  if (newPassword !== confirmNew) {
    setAuthStatus("New password and confirmation do not match.");
    return;
  }

  try {
    const response = await fetch("/api/auth/password/change", {
      method: "POST",
      headers: {
        ...authHeaders(token),
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
  } catch (error) {
    setAuthStatus(error.message || "Password change failed.");
  }
}

function toggleResetPanel() {
  if (!currentUser) {
    setAuthStatus("Login first to reset password.");
    return;
  }

  if (resetPanel) {
    resetPanel.classList.toggle("hidden");
    if (!resetPanel.classList.contains("hidden")) {
      currentPassword?.focus();
    }
  }
}

async function logout() {
  clearToken();
  updateAuthStatus(null);
  await loadGallery();
}

async function loadGallery() {
  try {
    const token = getToken();
    const response = await fetch("/api/items", {
      headers: token ? authHeaders(token) : undefined
    });

    allItems = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        clearToken();
        updateAuthStatus(null);
        setAuthStatus("Login required to view gallery.");
        galleryContainer.classList.add("hidden");
        noItemsMessage.classList.remove("hidden");
        noItemsMessage.innerHTML = "<p>Login to view your GIF gallery. You can create one from <a href=\"/\">Create</a>.</p>";
        return;
      }
      throw new Error(allItems?.error || `Unable to load items (${response.status}).`);
    }

    if (!Array.isArray(allItems) || allItems.length === 0) {
      galleryContainer.classList.add("hidden");
      noItemsMessage.classList.remove("hidden");
      noItemsMessage.innerHTML = currentUser
        ? "<div class=\"empty-card\"><h3>No GIFs yet</h3><p>Create your first QR hologram from Create page.</p><a class=\"link-btn\" href=\"/\">Create First QR</a></div>"
        : "<div class=\"empty-card\"><h3>Login required</h3><p>Sign in to view and manage your gallery.</p></div>";
      return;
    }

    noItemsMessage.classList.add("hidden");
    galleryContainer.classList.remove("hidden");
    renderGallery();
  } catch (err) {
    console.error("Failed to load gallery:", err);
    noItemsMessage.textContent = "Failed to load gallery.";
    noItemsMessage.classList.remove("hidden");
  }
}

function renderGallery() {
  galleryContainer.innerHTML = "";

  const grouped = groupItemsForGallery(allItems);

  grouped.forEach((group) => {
    const groupWrap = document.createElement("section");
    groupWrap.className = "upload-group";
    const groupLabel = group.groupId
      ? `Grouped Upload (${group.items.length} GIF${group.items.length === 1 ? "" : "s"})`
      : "Single Upload";
    const groupActions = group.groupId
      ? `
        <div class="group-head-actions">
          <button type="button" class="ghost-btn open-group-btn" data-group-id="${escapeHtml(group.groupId)}" data-group-count="${group.items.length}">Open Group</button>
          <button type="button" class="ghost-btn group-qr-btn" data-group-id="${escapeHtml(group.groupId)}" data-group-count="${group.items.length}">Group QR</button>
        </div>
      `
      : "";
    groupWrap.innerHTML = `
      <div class="group-head-row">
        <p class="upload-group-head">${escapeHtml(groupLabel)}</p>
        ${groupActions}
      </div>
    `;

    const cardsWrap = document.createElement("div");
    cardsWrap.className = "gallery-grid";

    group.items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "gallery-item";
      const canManage = Boolean(currentUser && item.canManage);

      card.innerHTML = `
      <div class="gallery-item-image">
        <img src="${escapeHtml(item.gifUrl)}" alt="${escapeHtml(item.overlayText)}" />
      </div>
      <div class="gallery-item-info">
        <h3>${escapeHtml(item.overlayText || "Untitled")}</h3>
        <p class="scan-count">Scans: ${item.scanCount || 0}</p>
        <p class="created-date">${formatDate(item.createdAt)}</p>
        <div class="gallery-actions">
          <button type="button" class="ghost-btn quick-view-btn">View QR</button>
          ${canManage ? '<button type="button" class="danger-btn quick-delete-btn">Delete</button>' : ""}
        </div>
      </div>
    `;

      const quickViewBtn = card.querySelector(".quick-view-btn");
      quickViewBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        showQRModal(item);
      });

      const quickDeleteBtn = card.querySelector(".quick-delete-btn");
      quickDeleteBtn?.addEventListener("click", async (event) => {
        event.stopPropagation();
        await quickDeleteItem(item);
      });

      card.addEventListener("click", () => showQRModal(item));
      cardsWrap.appendChild(card);
    });

    groupWrap.appendChild(cardsWrap);

    const openGroupBtn = groupWrap.querySelector(".open-group-btn");
    openGroupBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.location.href = `/scan?target=${encodeURIComponent(`g:${group.groupId}`)}`;
    });

    const groupQrBtn = groupWrap.querySelector(".group-qr-btn");
    groupQrBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      showGroupQRModal(group);
    });

    galleryContainer.appendChild(groupWrap);
  });
}

function showGroupQRModal(group) {
  if (!group?.groupId) {
    return;
  }

  selectedItem = null;
  selectedGroup = group;

  const baseUrl = window.location.origin;
  const groupUrl = `${baseUrl}/scan?target=${encodeURIComponent(`g:${group.groupId}`)}`;
  const groupQrUrl = `/api/group-qr/${encodeURIComponent(group.groupId)}?t=${Date.now()}`;

  modalTitle.textContent = `Grouped Upload (${group.items.length} GIF${group.items.length === 1 ? "" : "s"})`;
  viewerUrl.value = groupUrl;
  scanCountInfo.textContent = "Group QR for all GIFs in this batch.";

  qrImage.src = groupQrUrl;
  managePanel.classList.add("hidden");
  manageMessage.textContent = "";

  qrModal.classList.remove("hidden");
}

function groupItemsForGallery(items) {
  const sorted = [...items].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  const map = new Map();

  for (const item of sorted) {
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

async function quickDeleteItem(item) {
  if (!item || !item.id) {
    return;
  }

  const ok = window.confirm(`Delete '${item.overlayText || "Untitled"}' permanently?`);
  if (!ok) {
    return;
  }

  const token = getToken();
  if (!token) {
    setAuthStatus("Login required.");
    return;
  }

  try {
    const response = await fetch(`/api/items/${encodeURIComponent(item.id)}`, {
      method: "DELETE",
      headers: authHeaders(token)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Delete failed.");
    }

    await loadGallery();
    setAuthStatus("Item deleted.");
  } catch (error) {
    setAuthStatus(error.message || "Delete failed.");
  }
}

function showQRModal(item) {
  selectedGroup = null;
  selectedItem = item;
  modalTitle.textContent = item.overlayText || "Untitled";
  const baseUrl = window.location.origin;
  const url = `${baseUrl}/scan?target=${encodeURIComponent(`v:${item.id}`)}`;
  viewerUrl.value = url;
  scanCountInfo.textContent = `Scans: ${item.scanCount || 0} | Created: ${formatDate(item.createdAt)}`;

  qrImage.src = `/api/qr/${item.id}?t=${Date.now()}`;

  editOverlayText.value = item.overlayText || "";
  editQrDark.value = item.customization?.colors?.dark || "#221D23";
  editQrLight.value = item.customization?.colors?.light || "#D0E37F";
  updateEditScanability();
  manageMessage.textContent = "";

  const canManage = Boolean(currentUser && item.canManage);
  managePanel.classList.toggle("hidden", !canManage);
  if (!canManage) {
    setManageMessage("Read-only item. Login as owner or admin to edit/delete.", true);
  }

  qrModal.classList.remove("hidden");
}

function closeModal() {
  qrModal.classList.add("hidden");
  selectedItem = null;
  selectedGroup = null;
}

function copyUrl() {
  viewerUrl.select();
  document.execCommand("copy");

  const originalText = copyBtn.textContent;
  copyBtn.textContent = "Copied!";
  setTimeout(() => {
    copyBtn.textContent = originalText;
  }, 2000);
}

async function saveChanges() {
  if (!selectedItem) {
    return;
  }

  const token = getToken();
  if (!token) {
    setManageMessage("Login required.", true);
    return;
  }

  try {
    const response = await fetch(`/api/items/${encodeURIComponent(selectedItem.id)}`, {
      method: "PATCH",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        overlayText: editOverlayText.value,
        qrDark: editQrDark.value,
        qrLight: editQrLight.value
      })
    });

    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        clearToken();
        updateAuthStatus(null);
        throw new Error("Session expired. Please login again.");
      }
      if (response.status === 403) {
        throw new Error("You do not own this QR. Owner access required.");
      }
      throw new Error(data.error || "Save failed.");
    }

    selectedItem = data;
    modalTitle.textContent = data.overlayText || "Untitled";
    qrImage.src = `/api/qr/${data.id}?t=${Date.now()}`;
    setManageMessage("Saved.", false);
    await loadGallery();
  } catch (error) {
    setManageMessage(error.message || "Save failed.", true);
  }
}

function regenerateQr() {
  if (!selectedItem) {
    return;
  }
  qrImage.src = `/api/qr/${selectedItem.id}?t=${Date.now()}`;
  setManageMessage("QR refreshed.", false);
}

async function deleteItem() {
  if (!selectedItem) {
    return;
  }

  const ok = window.confirm("Delete this GIF QR code permanently?");
  if (!ok) {
    return;
  }

  const token = getToken();
  if (!token) {
    setManageMessage("Login required.", true);
    return;
  }

  try {
    const response = await fetch(`/api/items/${encodeURIComponent(selectedItem.id)}`, {
      method: "DELETE",
      headers: authHeaders(token)
    });

    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        clearToken();
        updateAuthStatus(null);
        throw new Error("Session expired. Please login again.");
      }
      if (response.status === 403) {
        throw new Error("You do not own this QR. Owner access required.");
      }
      throw new Error(data.error || "Delete failed.");
    }

    closeModal();
    await loadGallery();
  } catch (error) {
    setManageMessage(error.message || "Delete failed.", true);
  }
}

function updateAuthStatus(user) {
  currentUser = user || null;
  const summary = currentUser
    ? `Logged in as ${currentUser.username}${currentUser.role === "admin" ? " (admin)" : ""}`
    : "Not logged in.";
  authStatus.textContent = summary;
  if (accountQuickStatus) {
    accountQuickStatus.textContent = summary;
  }
  if (!currentUser && resetPanel) {
    resetPanel.classList.add("hidden");
  }

  if (currentAuthView === "password") {
    applyAuthView("password");
  }
}

function setAuthStatus(text) {
  authStatus.textContent = text;
  if (accountQuickStatus) {
    accountQuickStatus.textContent = text;
  }
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

function initEditQrPresets() {
  const presetButtons = document.querySelectorAll('.qr-preset-btn[data-preset-scope="edit"]');
  presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const dark = String(button.dataset.dark || "").toUpperCase();
      const light = String(button.dataset.light || "").toUpperCase();
      if (editQrDark && /^#[0-9A-F]{6}$/.test(dark)) {
        editQrDark.value = dark;
      }
      if (editQrLight && /^#[0-9A-F]{6}$/.test(light)) {
        editQrLight.value = light;
      }
      updateEditScanability();
    });
  });

  updateEditScanability();
}

function initAuthTabs() {
  authTabLogin?.addEventListener("click", () => applyAuthView("login"));
  authTabRegister?.addEventListener("click", () => applyAuthView("register"));
  authTabPassword?.addEventListener("click", () => applyAuthView("password"));
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
  logoutBtn?.classList.toggle("hidden", !currentUser);

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
  editQrDark?.addEventListener("input", updateEditScanability);
  editQrLight?.addEventListener("input", updateEditScanability);
  updateEditScanability();
}

function updateEditScanability() {
  if (!editScanabilityBadge || !editQrDark || !editQrLight) {
    return;
  }
  updateScanabilityBadge(editScanabilityBadge, editQrDark.value, editQrLight.value);
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

function setManageMessage(text, isError) {
  manageMessage.textContent = text;
  manageMessage.classList.toggle("error", Boolean(isError));
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`
  };
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function formatDate(dateStr) {
  if (!dateStr) return "Unknown";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
