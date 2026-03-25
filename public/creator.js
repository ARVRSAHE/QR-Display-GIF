const uploadForm = document.getElementById("uploadForm");
const gifInput = document.getElementById("gifInput");
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
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const TOKEN_KEY = "qrDisplayToken";
let currentUser = null;
let currentAuthView = "login";

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

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const token = getToken();
  if (!token) {
    setAuthStatus("Login required to create/manage your QR items.");
    setMessage("Please login first. Creating new GIF QR codes is owner-only.", true);
    return;
  }

  const file = gifInput.files?.[0];
  if (!file) {
    setMessage("Please choose a GIF file.", true);
    return;
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    setMessage("GIF is too large. Max allowed size is 25 MB.", true);
    return;
  }

  submitBtn.disabled = true;
  setMessage("Uploading and generating QR...", false);

  try {
    const body = new FormData(uploadForm);
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
        throw new Error("Upload too large (413). Use a smaller GIF (<= 25 MB).");
      }
      if (response.status === 403) {
        throw new Error("You do not have permission to upload with this account.");
      }
      throw new Error(data.error || `Upload failed (${response.status}).`);
    }

    if (!data?.id) {
      throw new Error("Upload succeeded but response was invalid.");
    }

    const viewerUrl = data.viewerUrl || `${window.location.origin}${data.viewerPath}`;

    qrImage.src = `/api/qr/${encodeURIComponent(data.id)}?t=${Date.now()}`;
    viewerUrlInput.value = viewerUrl;
    expiresAt.textContent = "Expires: Never (permanent for now)";
    result.classList.remove("hidden");
    setMessage("Done. Share this QR link or manage it from Gallery.", false);
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
}

function setMessage(text, isError) {
  formMessage.textContent = text;
  formMessage.classList.toggle("error", Boolean(isError));
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

bootstrapAuth();
