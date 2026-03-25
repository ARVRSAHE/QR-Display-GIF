const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const QRCode = require("qrcode");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const DB_PATH = path.join(__dirname, "data", "uploads.json");
const USERS_PATH = path.join(__dirname, "data", "users.json");
const UPLOAD_DIR = path.join(__dirname, "uploads");
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret-change-in-production";
const JWT_EXPIRES_IN = "7d";
const DEFAULT_QR_DARK = "#221D23";
const DEFAULT_QR_LIGHT = "#D0E37F";
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "abc123456789");

app.set("trust proxy", true);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || ".gif") || ".gif";
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    cb(null, `${id}${ext.toLowerCase()}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    const isGifMime = file.mimetype === "image/gif";
    const isGifExt = path.extname(file.originalname || "").toLowerCase() === ".gif";
    if (isGifMime || isGifExt) {
      cb(null, true);
      return;
    }
    cb(new Error("Only GIF uploads are allowed."));
  }
});

function ensureFile(filePath, defaultValue) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), "utf-8");
  }
}

function readJsonArray(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

function writeJsonArray(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function readDb() {
  return readJsonArray(DB_PATH);
}

function writeDb(data) {
  writeJsonArray(DB_PATH, data);
}

function readUsers() {
  return readJsonArray(USERS_PATH);
}

function writeUsers(data) {
  writeJsonArray(USERS_PATH, data);
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeText(input) {
  if (!input) {
    return "";
  }
  return String(input).replace(/[<>]/g, "").trim().slice(0, 60);
}

function sanitizeUsername(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "");
}

function isValidUsername(username) {
  return /^[a-z0-9_.-]{3,24}$/.test(username);
}

function sanitizeHexColor(color, fallback) {
  const value = String(color || "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
    return value.toUpperCase();
  }
  return fallback;
}

function sanitizeCustomization(input) {
  const dark = sanitizeHexColor(input?.dark, DEFAULT_QR_DARK);
  const light = sanitizeHexColor(input?.light, DEFAULT_QR_LIGHT);
  return {
    colors: {
      dark,
      light
    }
  };
}

function normalizeCustomizationFromBody(body) {
  return sanitizeCustomization({
    dark: body?.qrDark || body?.dark,
    light: body?.qrLight || body?.light
  });
}

function ensureCustomization(item) {
  return sanitizeCustomization({
    dark: item?.customization?.colors?.dark,
    light: item?.customization?.colors?.light
  });
}

function firstHeaderValue(value) {
  if (!value) {
    return "";
  }
  return String(value).split(",")[0].trim();
}

function normalizeBaseUrl(url) {
  if (!url) {
    return "";
  }
  return String(url).trim().replace(/\/$/, "");
}

function resolvePublicBaseUrl(req) {
  const envBase = normalizeBaseUrl(process.env.PUBLIC_BASE_URL || "");
  if (envBase) {
    return envBase;
  }

  const forwardedHost = firstHeaderValue(req.headers["x-forwarded-host"]);
  if (forwardedHost) {
    const forwardedProto = firstHeaderValue(req.headers["x-forwarded-proto"]) || "https";
    return `${forwardedProto}://${forwardedHost}`;
  }

  return `${req.protocol}://${req.get("host")}`;
}

function createToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role || "user"
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role || "user",
    createdAt: user.createdAt
  };
}

function authFromHeader(req) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) {
    return "";
  }
  return header.slice(7).trim();
}

function optionalAuth(req, _res, next) {
  const token = authFromHeader(req);
  if (!token) {
    req.user = null;
    next();
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const users = readUsers();
    const user = users.find((x) => x.id === payload.sub);
    req.user = user || null;
  } catch (_err) {
    req.user = null;
  }

  next();
}

function requireAuth(req, res, next) {
  optionalAuth(req, res, () => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    next();
  });
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if ((req.user.role || "user") !== "admin") {
      res.status(403).json({ error: "Admin access required." });
      return;
    }
    next();
  });
}

function migrateUploads() {
  const db = readDb();
  let changed = false;

  for (const item of db) {
    if (!Object.prototype.hasOwnProperty.call(item, "userId")) {
      item.userId = null;
      changed = true;
    }

    const normalized = ensureCustomization(item);
    if (!item.customization || JSON.stringify(item.customization) !== JSON.stringify(normalized)) {
      item.customization = normalized;
      changed = true;
    }
  }

  if (changed) {
    writeDb(db);
  }
}

function migrateUsers() {
  const users = readUsers();
  let changed = false;
  const used = new Set();

  for (const user of users) {
    if (!user.createdAt) {
      user.createdAt = nowIso();
      changed = true;
    }

    if (!user.role) {
      user.role = "user";
      changed = true;
    }

    let username = sanitizeUsername(user.username || "");
    if (!isValidUsername(username)) {
      const emailPrefix = String(user.email || "").split("@")[0];
      username = sanitizeUsername(emailPrefix || `user${Math.random().toString(36).slice(2, 8)}`);
      if (!isValidUsername(username)) {
        username = `user${Math.random().toString(36).slice(2, 8)}`;
      }
      changed = true;
    }

    let unique = username;
    let n = 1;
    while (used.has(unique)) {
      unique = `${username}${n}`;
      n += 1;
    }
    if (unique !== user.username) {
      user.username = unique;
      changed = true;
    }
    used.add(unique);
  }

  if (changed) {
    writeUsers(users);
  }
}

function ensureAdminAccount() {
  const users = readUsers();
  let admin = users.find((u) => u.username === ADMIN_USERNAME);

  if (!admin) {
    admin = {
      id: `user-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      username: ADMIN_USERNAME,
      passwordHash: bcrypt.hashSync(ADMIN_PASSWORD, 10),
      role: "admin",
      createdAt: nowIso()
    };
    users.push(admin);
    writeUsers(users);
    return;
  }

  if (admin.role !== "admin") {
    admin.role = "admin";
  }

  // Keep admin login recoverable in this prototype by syncing the startup password.
  const adminPasswordMatches = Boolean(admin.passwordHash && bcrypt.compareSync(ADMIN_PASSWORD, admin.passwordHash));
  if (!adminPasswordMatches) {
    admin.passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
    delete admin.resetToken;
    delete admin.resetExpiresAt;
  }

  writeUsers(users);
}

function toItemResponse(item, reqUser) {
  const isAdmin = Boolean(reqUser && (reqUser.role || "user") === "admin");
  return {
    id: item.id,
    overlayText: item.overlayText,
    gifUrl: `/${item.gifPath}`,
    createdAt: item.createdAt,
    expiresAt: item.expiresAt,
    scanCount: item.scanCount,
    customization: ensureCustomization(item),
    isOwned: Boolean(reqUser && item.userId && item.userId === reqUser.id),
    canManage: Boolean(reqUser && (item.userId === reqUser.id || isAdmin))
  };
}

function deleteUploadsForUser(userId) {
  const db = readDb();
  const owned = db.filter((item) => item.userId === userId);
  const remaining = db.filter((item) => item.userId !== userId);

  for (const item of owned) {
    const absoluteGif = path.join(__dirname, item.gifPath || "");
    if (absoluteGif.startsWith(UPLOAD_DIR) && fs.existsSync(absoluteGif)) {
      try {
        fs.unlinkSync(absoluteGif);
      } catch (_err) {
        // Ignore file delete failures.
      }
    }
  }

  writeDb(remaining);
  return owned.length;
}

ensureFile(DB_PATH, []);
ensureFile(USERS_PATH, []);
migrateUploads();
migrateUsers();
ensureAdminAccount();

app.post("/api/auth/register", async (req, res) => {
  try {
    const username = sanitizeUsername(req.body?.username);
    const password = String(req.body?.password || "");

    if (!isValidUsername(username)) {
      res.status(400).json({ error: "Username must be 3-24 chars: letters, numbers, ., _, -." });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }

    const users = readUsers();
    if (users.some((x) => x.username === username)) {
      res.status(409).json({ error: "Username already taken." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = {
      id: `user-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      username,
      passwordHash,
      role: "user",
      createdAt: nowIso()
    };

    users.push(user);
    writeUsers(users);

    const token = createToken(user);
    res.status(201).json({ user: publicUser(user), token });
  } catch (err) {
    res.status(500).json({ error: err.message || "Registration failed." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const username = sanitizeUsername(req.body?.username);
    const password = String(req.body?.password || "");

    const users = readUsers();
    const user = users.find((x) => x.username === username);
    if (!user) {
      res.status(401).json({ error: "Invalid credentials." });
      return;
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Invalid credentials." });
      return;
    }

    const token = createToken(user);
    res.json({ user: publicUser(user), token });
  } catch (err) {
    res.status(500).json({ error: err.message || "Login failed." });
  }
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.post("/api/auth/logout", (_req, res) => {
  res.json({ success: true });
});

app.post("/api/auth/password/change", requireAuth, async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");

    if (!currentPassword) {
      res.status(400).json({ error: "Current password is required." });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ error: "New password must be at least 8 characters." });
      return;
    }

    const users = readUsers();
    const user = users.find((u) => u.id === req.user.id);
    if (!user) {
      res.status(404).json({ error: "User not found." });
      return;
    }

    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      res.status(401).json({ error: "Current password is incorrect." });
      return;
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    delete user.resetToken;
    delete user.resetExpiresAt;
    writeUsers(users);

    res.json({ success: true, message: "Password updated successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message || "Password update failed." });
  }
});

app.post("/api/auth/reset/request", (req, res) => {
  const username = sanitizeUsername(req.body?.username);
  if (!isValidUsername(username)) {
    res.status(400).json({ error: "Valid username is required." });
    return;
  }

  const users = readUsers();
  const user = users.find((x) => x.username === username);
  if (!user) {
    res.json({
      success: true,
      message: "If this account exists, a reset token has been generated."
    });
    return;
  }

  const resetToken = crypto.randomBytes(16).toString("hex");
  const resetExpiresAt = Date.now() + 15 * 60 * 1000;
  user.resetToken = resetToken;
  user.resetExpiresAt = resetExpiresAt;
  writeUsers(users);

  res.json({
    success: true,
    message: "Reset token generated. In production this would be sent securely.",
    resetToken
  });
});

app.post("/api/auth/reset/confirm", async (req, res) => {
  try {
    const username = sanitizeUsername(req.body?.username);
    const token = String(req.body?.token || "").trim();
    const newPassword = String(req.body?.newPassword || "");

    if (!isValidUsername(username)) {
      res.status(400).json({ error: "Valid username is required." });
      return;
    }

    if (!token) {
      res.status(400).json({ error: "Reset token is required." });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ error: "New password must be at least 8 characters." });
      return;
    }

    const users = readUsers();
    const user = users.find((x) => x.username === username);
    if (!user || !user.resetToken || user.resetToken !== token) {
      res.status(400).json({ error: "Invalid reset token." });
      return;
    }

    if (!user.resetExpiresAt || Number(user.resetExpiresAt) < Date.now()) {
      res.status(400).json({ error: "Reset token expired. Request a new one." });
      return;
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    delete user.resetToken;
    delete user.resetExpiresAt;
    writeUsers(users);

    res.json({ success: true, message: "Password updated successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message || "Password reset failed." });
  }
});

app.get("/api/admin/users", requireAdmin, (req, res) => {
  const users = readUsers();
  const db = readDb();
  const counts = new Map();

  for (const item of db) {
    if (item.userId) {
      counts.set(item.userId, (counts.get(item.userId) || 0) + 1);
    }
  }

  const payload = users.map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role || "user",
    createdAt: u.createdAt,
    uploadsCount: counts.get(u.id) || 0
  }));

  res.json(payload);
});

app.patch("/api/admin/users/:id/password", requireAdmin, async (req, res) => {
  try {
    const newPassword = String(req.body?.newPassword || "");
    if (newPassword.length < 8) {
      res.status(400).json({ error: "New password must be at least 8 characters." });
      return;
    }

    const users = readUsers();
    const user = users.find((u) => u.id === req.params.id);
    if (!user) {
      res.status(404).json({ error: "User not found." });
      return;
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    delete user.resetToken;
    delete user.resetExpiresAt;
    writeUsers(users);

    res.json({ success: true, user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message || "Password update failed." });
  }
});

app.delete("/api/admin/users/:id", requireAdmin, (req, res) => {
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  const user = users[idx];
  if (user.id === req.user.id) {
    res.status(400).json({ error: "Admin cannot delete their own account." });
    return;
  }

  users.splice(idx, 1);
  writeUsers(users);
  const removedUploads = deleteUploadsForUser(user.id);

  res.json({
    success: true,
    removedUserId: user.id,
    removedUploads
  });
});

app.post("/api/upload", requireAuth, upload.single("gif"), (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "GIF file is required." });
      return;
    }

    const overlayText = sanitizeText(req.body.overlayText || "");
    const id = `holo-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const relativeGifPath = path.join("uploads", req.file.filename).replace(/\\/g, "/");
    const customization = normalizeCustomizationFromBody(req.body);

    const entry = {
      id,
      userId: req.user.id,
      overlayText,
      gifPath: relativeGifPath,
      createdAt: nowIso(),
      expiresAt: null,
      scanCount: 0,
      customization
    };

    const db = readDb();
    db.push(entry);
    writeDb(db);

    const viewerPath = `/v/${id}`;
    const viewerUrl = `${resolvePublicBaseUrl(req)}${viewerPath}`;
    res.json({
      id,
      viewerPath,
      viewerUrl,
      expiresAt: null,
      customization
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Upload failed." });
  }
});

app.get("/api/item/:id", optionalAuth, (req, res) => {
  const db = readDb();
  const item = db.find((x) => x.id === req.params.id);

  if (!item) {
    res.status(404).json({ error: "Not found." });
    return;
  }

  item.scanCount += 1;
  writeDb(db);

  res.json(toItemResponse(item, req.user));
});

app.get("/api/items", requireAuth, (req, res) => {
  const db = readDb();
  const isAdmin = Boolean(req.user && (req.user.role || "user") === "admin");
  const items = req.user
    ? (isAdmin ? db : db.filter((item) => item.userId === req.user.id))
    : db;

  res.json(items.map((item) => toItemResponse(item, req.user)));
});

app.patch("/api/items/:id", requireAuth, (req, res) => {
  const db = readDb();
  const item = db.find((x) => x.id === req.params.id);

  if (!item) {
    res.status(404).json({ error: "Not found." });
    return;
  }

  const isAdmin = (req.user.role || "user") === "admin";
  if (!item.userId || (item.userId !== req.user.id && !isAdmin)) {
    res.status(403).json({ error: "Only the owner or admin can edit this item." });
    return;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "overlayText")) {
    item.overlayText = sanitizeText(req.body.overlayText || "");
  }

  if (req.body.qrDark || req.body.qrLight || req.body.dark || req.body.light) {
    item.customization = normalizeCustomizationFromBody(req.body);
  } else {
    item.customization = ensureCustomization(item);
  }

  writeDb(db);
  res.json(toItemResponse(item, req.user));
});

app.delete("/api/items/:id", requireAuth, (req, res) => {
  const db = readDb();
  const idx = db.findIndex((x) => x.id === req.params.id);

  if (idx === -1) {
    res.status(404).json({ error: "Not found." });
    return;
  }

  const item = db[idx];
  const isAdmin = (req.user.role || "user") === "admin";
  if (!item.userId || (item.userId !== req.user.id && !isAdmin)) {
    res.status(403).json({ error: "Only the owner or admin can delete this item." });
    return;
  }

  db.splice(idx, 1);
  writeDb(db);

  const absoluteGif = path.join(__dirname, item.gifPath || "");
  if (absoluteGif.startsWith(UPLOAD_DIR) && fs.existsSync(absoluteGif)) {
    try {
      fs.unlinkSync(absoluteGif);
    } catch (_err) {
      // Ignore file deletion issues and still return success for metadata delete.
    }
  }

  res.json({ success: true });
});

app.get("/api/qr/:id", async (req, res) => {
  const db = readDb();
  const item = db.find((x) => x.id === req.params.id);

  if (!item) {
    res.status(404).json({ error: "Not found." });
    return;
  }

  const requestedBase = normalizeBaseUrl(req.query.base || "");
  const baseUrl = requestedBase || resolvePublicBaseUrl(req);
  const viewerUrl = `${baseUrl}/v/${item.id}`;
  const customization = ensureCustomization(item);

  try {
    const pngBuffer = await QRCode.toBuffer(viewerUrl, {
      type: "png",
      width: 360,
      margin: 2,
      color: {
        dark: customization.colors.dark,
        light: customization.colors.light
      }
    });
    res.setHeader("Content-Type", "image/png");
    res.send(pngBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message || "QR generation failed." });
  }
});

app.get("/v/:id", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "viewer.html"));
});

app.get("/gallery", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "gallery.html"));
});

app.get("/marker", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "marker.html"));
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "File too large. Max size is 25 MB." });
      return;
    }
  }
  res.status(400).json({ error: err.message || "Request failed." });
});

app.listen(PORT, () => {
  console.log(`QR Display GIF app running at http://localhost:${PORT}`);
});
