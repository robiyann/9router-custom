import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let tempDir;
const originalDataDir = process.env.DATA_DIR;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-perm-mig-"));
  process.env.DATA_DIR = tempDir;
  delete global._dbAdapter;
  vi.resetModules();
});

afterEach(() => {
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("API Key Permissions Schema Migration", () => {
  it("creates apiKeys table with permissions column", async () => {
    const { getAdapter } = await import("@/lib/db/driver.js");
    const db = await getAdapter();

    const info = db.all("PRAGMA table_info(apiKeys)");
    const permissionsCol = info.find(col => col.name === "permissions");
    expect(permissionsCol).toBeDefined();
    expect(permissionsCol.type).toBe("TEXT");

    const schemaVersionRow = db.get("SELECT value FROM _meta WHERE key = 'schemaVersion'");
    expect(parseInt(schemaVersionRow.value, 10)).toBe(2);
  });
});
