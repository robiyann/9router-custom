import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

function rowToKey(row) {
  if (!row) return null;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    machineId: row.machineId,
    isActive: row.isActive === 1 || row.isActive === true,
    permissions: parseJson(row.permissions, null),
    createdAt: row.createdAt,
  };
}

export async function getApiKeys() {
  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM apiKeys ORDER BY createdAt ASC`);
  return rows.map(rowToKey);
}

export async function getApiKeyById(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
  return rowToKey(row);
}

export async function getApiKeyByKey(key) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE key = ?`, [key]);
  return rowToKey(row);
}

export async function createApiKey(name, machineId, permissions = null) {
  if (!machineId) throw new Error("machineId is required");
  const db = await getAdapter();
  const { generateApiKeyWithMachine } = await import("@/shared/utils/apiKey");
  const result = generateApiKeyWithMachine(machineId);
  const apiKey = {
    id: uuidv4(),
    name,
    key: result.key,
    machineId,
    isActive: true,
    permissions,
    createdAt: new Date().toISOString(),
  };
  const permsStr = permissions ? stringifyJson(permissions) : null;
  db.run(
    `INSERT INTO apiKeys(id, key, name, machineId, isActive, permissions, createdAt) VALUES(?, ?, ?, ?, ?, ?, ?)`,
    [apiKey.id, apiKey.key, apiKey.name, apiKey.machineId, 1, permsStr, apiKey.createdAt]
  );
  return apiKey;
}

export async function updateApiKey(id, data) {
  const db = await getAdapter();
  let result = null;
  let oldKey = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
    if (!row) return;
    oldKey = row.key;
    const merged = { ...rowToKey(row), ...data };
    const permissionsStr = stringifyJson(merged.permissions);
    db.run(
      `UPDATE apiKeys SET key = ?, name = ?, machineId = ?, isActive = ?, permissions = ? WHERE id = ?`,
      [merged.key, merged.name, merged.machineId, merged.isActive ? 1 : 0, permissionsStr, id]
    );
    result = merged;
  });
  if (result) {
    try {
      const { invalidateKey } = await import("../../auth/apiKeyPermissions.js");
      if (oldKey) invalidateKey(oldKey);
      invalidateKey(result.key);
    } catch {}
  }
  return result;
}

export async function updatePermissions(id, permissions) {
  const db = await getAdapter();
  const permsStr = stringifyJson(permissions);
  const keyInfo = await getApiKeyById(id);
  const res = db.run(`UPDATE apiKeys SET permissions = ? WHERE id = ?`, [permsStr, id]);
  if (keyInfo) {
    try {
      const { invalidateKey } = await import("../../auth/apiKeyPermissions.js");
      invalidateKey(keyInfo.key);
    } catch {}
  }
  return (res?.changes ?? 0) > 0;
}

export async function deleteApiKey(id) {
  const db = await getAdapter();
  const keyInfo = await getApiKeyById(id);
  const res = db.run(`DELETE FROM apiKeys WHERE id = ?`, [id]);
  if (keyInfo) {
    try {
      const { invalidateKey } = await import("../../auth/apiKeyPermissions.js");
      invalidateKey(keyInfo.key);
    } catch {}
  }
  return (res?.changes ?? 0) > 0;
}

export async function validateApiKey(key) {
  const db = await getAdapter();
  const row = db.get(`SELECT isActive FROM apiKeys WHERE key = ?`, [key]);
  if (!row) return false;
  return row.isActive === 1 || row.isActive === true;
}
