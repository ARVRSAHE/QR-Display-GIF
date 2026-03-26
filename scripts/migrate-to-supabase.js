const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const ROOT = path.join(__dirname, "..");
const USERS_PATH = path.join(ROOT, "data", "users.json");
const UPLOADS_PATH = path.join(ROOT, "data", "uploads.json");
const FILES_ROOT = ROOT;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "gifs";
const USERS_TABLE = process.env.SUPABASE_USERS_TABLE || "users";
const UPLOADS_TABLE = process.env.SUPABASE_UPLOADS_TABLE || "uploads";

function readJsonArray(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function ensureCustomization(item) {
  const dark = String(item?.customization?.colors?.dark || "#221D23").toUpperCase();
  const light = String(item?.customization?.colors?.light || "#D0E37F").toUpperCase();
  return {
    colors: {
      dark: /^#[0-9A-F]{6}$/.test(dark) ? dark : "#221D23",
      light: /^#[0-9A-F]{6}$/.test(light) ? light : "#D0E37F"
    }
  };
}

function toUserRow(user) {
  return {
    id: user.id,
    username: String(user.username || "").trim().toLowerCase(),
    password_hash: user.passwordHash,
    role: user.role || "user",
    created_at: user.createdAt || new Date().toISOString(),
    reset_token: user.resetToken || null,
    reset_expires_at: user.resetExpiresAt || null
  };
}

function toUploadRow(upload, storageKey) {
  const groupId = String(upload.groupId || "").trim();
  return {
    id: upload.id,
    user_id: upload.userId || null,
    group_id: groupId || null,
    overlay_text: String(upload.overlayText || "").slice(0, 60),
    gif_storage_key: storageKey,
    created_at: upload.createdAt || new Date().toISOString(),
    expires_at: upload.expiresAt || null,
    scan_count: Number(upload.scanCount || 0),
    customization: ensureCustomization(upload)
  };
}

function toStorageKey(upload) {
  const filename = path.basename(String(upload.gifPath || ""));
  return `migrated/uploads/${filename}`;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running migration.");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  const users = readJsonArray(USERS_PATH);
  const uploads = readJsonArray(UPLOADS_PATH);

  const userRows = users.map(toUserRow);
  if (userRows.length) {
    const { error } = await supabase.from(USERS_TABLE).upsert(userRows, { onConflict: "id" });
    if (error) {
      throw error;
    }
  }

  for (const upload of uploads) {
    const relativeGifPath = String(upload.gifPath || "");
    const absoluteGifPath = path.join(FILES_ROOT, relativeGifPath);
    const storageKey = toStorageKey(upload);

    if (!fs.existsSync(absoluteGifPath)) {
      console.warn(`Skipping missing file for upload ${upload.id}: ${relativeGifPath}`);
      continue;
    }

    const fileBuffer = fs.readFileSync(absoluteGifPath);
    const { error: uploadError } = await supabase.storage.from(SUPABASE_BUCKET).upload(storageKey, fileBuffer, {
      contentType: "image/gif",
      upsert: true
    });

    if (uploadError) {
      throw uploadError;
    }

    const row = toUploadRow(upload, storageKey);
    const { error: rowError } = await supabase.from(UPLOADS_TABLE).upsert([row], { onConflict: "id" });
    if (rowError) {
      throw rowError;
    }
  }

  console.log(`Migrated users: ${userRows.length}`);
  console.log(`Migrated uploads (attempted): ${uploads.length}`);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
