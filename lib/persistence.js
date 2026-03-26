const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const DEFAULT_QR_DARK = "#221D23";
const DEFAULT_QR_LIGHT = "#D0E37F";

function sortByCreatedAtAsc(a, b) {
  return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
}

function ensureCustomization(item) {
  const dark = String(item?.customization?.colors?.dark || DEFAULT_QR_DARK).toUpperCase();
  const light = String(item?.customization?.colors?.light || DEFAULT_QR_LIGHT).toUpperCase();
  return {
    colors: {
      dark: /^#[0-9A-F]{6}$/.test(dark) ? dark : DEFAULT_QR_DARK,
      light: /^#[0-9A-F]{6}$/.test(light) ? light : DEFAULT_QR_LIGHT
    }
  };
}

function mapUserRowToDomain(row) {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role || "user",
    createdAt: row.created_at,
    resetToken: row.reset_token,
    resetExpiresAt: row.reset_expires_at
  };
}

function mapUserDomainToRow(user) {
  return {
    id: user.id,
    username: user.username,
    password_hash: user.passwordHash,
    role: user.role || "user",
    created_at: user.createdAt,
    reset_token: user.resetToken || null,
    reset_expires_at: user.resetExpiresAt || null
  };
}

function mapUploadRowToDomain(row) {
  return {
    id: row.id,
    userId: row.user_id || null,
    groupId: row.group_id || "",
    overlayText: row.overlay_text || "",
    gifPath: row.gif_storage_key,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    scanCount: Number(row.scan_count || 0),
    customization: ensureCustomization({ customization: row.customization })
  };
}

function mapUploadDomainToRow(upload) {
  return {
    id: upload.id,
    user_id: upload.userId || null,
    group_id: upload.groupId || null,
    overlay_text: upload.overlayText || "",
    gif_storage_key: upload.gifPath,
    created_at: upload.createdAt,
    expires_at: upload.expiresAt || null,
    scan_count: Number(upload.scanCount || 0),
    customization: ensureCustomization(upload)
  };
}

function createLocalProvider(options) {
  const {
    dbPath,
    usersPath,
    uploadDir
  } = options;

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

  function readUsersArray() {
    return readJsonArray(usersPath);
  }

  function writeUsersArray(users) {
    writeJsonArray(usersPath, users);
  }

  function readUploadsArray() {
    return readJsonArray(dbPath);
  }

  function writeUploadsArray(uploads) {
    writeJsonArray(dbPath, uploads);
  }

  return {
    mode: "local",
    async listUsers() {
      return readJsonArray(usersPath);
    },
    async upsertUsers(users) {
      writeJsonArray(usersPath, users);
    },
    async listUploads() {
      return readJsonArray(dbPath);
    },
    async upsertUploads(uploads) {
      writeJsonArray(dbPath, uploads);
    },
    async getUserById(userId) {
      return readUsersArray().find((u) => u.id === userId) || null;
    },
    async getUserByUsername(username) {
      return readUsersArray().find((u) => u.username === username) || null;
    },
    async createUser(user) {
      const users = readUsersArray();
      users.push(user);
      writeUsersArray(users);
      return user;
    },
    async replaceUser(user) {
      const users = readUsersArray();
      const idx = users.findIndex((u) => u.id === user.id);
      if (idx === -1) {
        throw new Error("User not found.");
      }
      users[idx] = user;
      writeUsersArray(users);
      return user;
    },
    async deleteUserById(userId) {
      const users = readUsersArray();
      const idx = users.findIndex((u) => u.id === userId);
      if (idx === -1) {
        return null;
      }
      const deleted = users[idx];
      users.splice(idx, 1);
      writeUsersArray(users);
      return deleted;
    },
    async listUsersWithUploadCounts() {
      const users = readUsersArray();
      const uploads = readUploadsArray();
      const counts = new Map();
      for (const item of uploads) {
        if (item.userId) {
          counts.set(item.userId, (counts.get(item.userId) || 0) + 1);
        }
      }
      return users.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role || "user",
        createdAt: u.createdAt,
        uploadsCount: counts.get(u.id) || 0
      }));
    },
    async createUpload(upload) {
      const uploads = readUploadsArray();
      uploads.push(upload);
      writeUploadsArray(uploads);
      return upload;
    },
    async getUploadById(uploadId) {
      return readUploadsArray().find((u) => u.id === uploadId) || null;
    },
    async listUploadsByGroupId(groupId) {
      return readUploadsArray().filter((u) => (u.groupId || "") === groupId).sort(sortByCreatedAtAsc);
    },
    async groupExists(groupId) {
      return readUploadsArray().some((u) => (u.groupId || "") === groupId);
    },
    async listAllUploads() {
      return readUploadsArray();
    },
    async listUploadsByUserId(userId) {
      return readUploadsArray().filter((u) => u.userId === userId);
    },
    async replaceUpload(upload) {
      const uploads = readUploadsArray();
      const idx = uploads.findIndex((u) => u.id === upload.id);
      if (idx === -1) {
        throw new Error("Upload not found.");
      }
      uploads[idx] = upload;
      writeUploadsArray(uploads);
      return upload;
    },
    async deleteUploadById(uploadId) {
      const uploads = readUploadsArray();
      const idx = uploads.findIndex((u) => u.id === uploadId);
      if (idx === -1) {
        return null;
      }
      const deleted = uploads[idx];
      uploads.splice(idx, 1);
      writeUploadsArray(uploads);
      return deleted;
    },
    async deleteUploadsByUserId(userId) {
      const uploads = readUploadsArray();
      const owned = uploads.filter((u) => u.userId === userId);
      const remaining = uploads.filter((u) => u.userId !== userId);
      writeUploadsArray(remaining);
      return owned;
    },
    async incrementScanByUploadId(uploadId) {
      const uploads = readUploadsArray();
      const item = uploads.find((u) => u.id === uploadId);
      if (!item) {
        return null;
      }
      item.scanCount = Number(item.scanCount || 0) + 1;
      writeUploadsArray(uploads);
      return item;
    },
    async incrementScanByGroupId(groupId) {
      const uploads = readUploadsArray();
      const items = uploads.filter((u) => (u.groupId || "") === groupId).sort(sortByCreatedAtAsc);
      for (const item of items) {
        item.scanCount = Number(item.scanCount || 0) + 1;
      }
      if (items.length) {
        writeUploadsArray(uploads);
      }
      return items;
    },
    async storeUploadedGif(file, uploadId) {
      return path.join("uploads", file.filename).replace(/\\/g, "/");
    },
    resolveGifUrl(gifPath) {
      return `/${String(gifPath || "")}`;
    },
    async deleteStoredGif(gifPath) {
      const absoluteGif = path.join(path.dirname(uploadDir), String(gifPath || ""));
      if (!absoluteGif.startsWith(uploadDir)) {
        return;
      }
      if (!fs.existsSync(absoluteGif)) {
        return;
      }
      try {
        fs.unlinkSync(absoluteGif);
      } catch (_err) {
        // Ignore local cleanup failures.
      }
    }
  };
}

function createSupabaseProvider(options) {
  const {
    supabaseUrl,
    supabaseServiceRoleKey,
    supabaseBucket,
    uploadsTable,
    usersTable
  } = options;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for Supabase provider.");
  }

  const client = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false }
  });

  return {
    mode: "supabase",
    async listUsers() {
      const { data, error } = await client.from(usersTable).select("*");
      if (error) {
        throw error;
      }
      return (data || []).map(mapUserRowToDomain);
    },
    async upsertUsers(users) {
      const rows = users.map(mapUserDomainToRow);
      const { error } = await client.from(usersTable).upsert(rows, { onConflict: "id" });
      if (error) {
        throw error;
      }
    },
    async listUploads() {
      const { data, error } = await client.from(uploadsTable).select("*");
      if (error) {
        throw error;
      }
      return (data || []).map(mapUploadRowToDomain);
    },
    async upsertUploads(uploads) {
      const rows = uploads.map(mapUploadDomainToRow);
      const { error } = await client.from(uploadsTable).upsert(rows, { onConflict: "id" });
      if (error) {
        throw error;
      }
    },
    async getUserById(userId) {
      const { data, error } = await client.from(usersTable).select("*").eq("id", userId).maybeSingle();
      if (error) {
        throw error;
      }
      return data ? mapUserRowToDomain(data) : null;
    },
    async getUserByUsername(username) {
      const { data, error } = await client.from(usersTable).select("*").eq("username", username).maybeSingle();
      if (error) {
        throw error;
      }
      return data ? mapUserRowToDomain(data) : null;
    },
    async createUser(user) {
      const row = mapUserDomainToRow(user);
      const { data, error } = await client.from(usersTable).insert([row]).select("*").single();
      if (error) {
        throw error;
      }
      return mapUserRowToDomain(data);
    },
    async replaceUser(user) {
      const row = mapUserDomainToRow(user);
      const { data, error } = await client.from(usersTable).upsert([row], { onConflict: "id" }).select("*").single();
      if (error) {
        throw error;
      }
      return mapUserRowToDomain(data);
    },
    async deleteUserById(userId) {
      const { data, error } = await client.from(usersTable).delete().eq("id", userId).select("*").maybeSingle();
      if (error) {
        throw error;
      }
      return data ? mapUserRowToDomain(data) : null;
    },
    async listUsersWithUploadCounts() {
      const users = await this.listUsers();
      const uploads = await this.listUploads();
      const counts = new Map();
      for (const item of uploads) {
        if (item.userId) {
          counts.set(item.userId, (counts.get(item.userId) || 0) + 1);
        }
      }
      return users.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role || "user",
        createdAt: u.createdAt,
        uploadsCount: counts.get(u.id) || 0
      }));
    },
    async createUpload(upload) {
      const row = mapUploadDomainToRow(upload);
      const { data, error } = await client.from(uploadsTable).insert([row]).select("*").single();
      if (error) {
        throw error;
      }
      return mapUploadRowToDomain(data);
    },
    async getUploadById(uploadId) {
      const { data, error } = await client.from(uploadsTable).select("*").eq("id", uploadId).maybeSingle();
      if (error) {
        throw error;
      }
      return data ? mapUploadRowToDomain(data) : null;
    },
    async listUploadsByGroupId(groupId) {
      const { data, error } = await client
        .from(uploadsTable)
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true });
      if (error) {
        throw error;
      }
      return (data || []).map(mapUploadRowToDomain);
    },
    async groupExists(groupId) {
      const { count, error } = await client
        .from(uploadsTable)
        .select("id", { count: "exact", head: true })
        .eq("group_id", groupId)
        .limit(1);
      if (error) {
        throw error;
      }
      return Number(count || 0) > 0;
    },
    async listAllUploads() {
      return this.listUploads();
    },
    async listUploadsByUserId(userId) {
      const { data, error } = await client.from(uploadsTable).select("*").eq("user_id", userId);
      if (error) {
        throw error;
      }
      return (data || []).map(mapUploadRowToDomain);
    },
    async replaceUpload(upload) {
      const row = mapUploadDomainToRow(upload);
      const { data, error } = await client.from(uploadsTable).upsert([row], { onConflict: "id" }).select("*").single();
      if (error) {
        throw error;
      }
      return mapUploadRowToDomain(data);
    },
    async deleteUploadById(uploadId) {
      const { data, error } = await client.from(uploadsTable).delete().eq("id", uploadId).select("*").maybeSingle();
      if (error) {
        throw error;
      }
      return data ? mapUploadRowToDomain(data) : null;
    },
    async deleteUploadsByUserId(userId) {
      const { data, error } = await client.from(uploadsTable).delete().eq("user_id", userId).select("*");
      if (error) {
        throw error;
      }
      return (data || []).map(mapUploadRowToDomain);
    },
    async incrementScanByUploadId(uploadId) {
      const item = await this.getUploadById(uploadId);
      if (!item) {
        return null;
      }
      item.scanCount = Number(item.scanCount || 0) + 1;
      return this.replaceUpload(item);
    },
    async incrementScanByGroupId(groupId) {
      const items = await this.listUploadsByGroupId(groupId);
      const updated = [];
      for (const item of items) {
        item.scanCount = Number(item.scanCount || 0) + 1;
        updated.push(await this.replaceUpload(item));
      }
      return updated;
    },
    async storeUploadedGif(file, uploadId) {
      const month = new Date().toISOString().slice(0, 7);
      const filename = path.basename(String(file.originalname || file.filename || "upload.gif"));
      const ext = path.extname(filename).toLowerCase() || ".gif";
      const safeName = path.basename(filename, ext).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "upload";
      const objectKey = `live/${month}/${uploadId}/${safeName}${ext}`;
      const payload = fs.readFileSync(file.path);
      const { error } = await client.storage.from(supabaseBucket).upload(objectKey, payload, {
        contentType: "image/gif",
        upsert: false
      });
      if (error) {
        throw error;
      }
      return objectKey;
    },
    resolveGifUrl(gifPath) {
      const { data } = client.storage.from(supabaseBucket).getPublicUrl(String(gifPath || ""));
      return data?.publicUrl || "";
    },
    async deleteStoredGif(gifPath) {
      if (!gifPath) {
        return;
      }
      const { error } = await client.storage.from(supabaseBucket).remove([String(gifPath)]);
      if (error) {
        throw error;
      }
    }
  };
}

function createPersistenceProvider(options) {
  const mode = String(options.mode || "local").toLowerCase();
  if (mode === "supabase") {
    return createSupabaseProvider(options);
  }
  return createLocalProvider(options);
}

module.exports = {
  createPersistenceProvider,
  ensureCustomization
};
