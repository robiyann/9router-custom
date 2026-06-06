import { NextResponse } from "next/server";
import { access, constants } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const ACCESS_TOKEN_KEYS = ["cursorAuth/accessToken", "cursorAuth/token"];
const MACHINE_ID_KEYS = [
  "storage.serviceMachineId",
  "storage.machineId",
  "telemetry.machineId",
];

/** Get candidate db paths by platform */
function getCandidatePaths(platform) {
  const home = homedir();

  if (platform === "darwin") {
    return [
      join(
        home,
        "Library/Application Support/Cursor/User/globalStorage/state.vscdb",
      ),
      join(
        home,
        "Library/Application Support/Cursor - Insiders/User/globalStorage/state.vscdb",
      ),
    ];
  }

  if (platform === "win32") {
    const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
    const localAppData =
      process.env.LOCALAPPDATA || join(home, "AppData", "Local");
    return [
      join(appData, "Cursor", "User", "globalStorage", "state.vscdb"),
      join(
        appData,
        "Cursor - Insiders",
        "User",
        "globalStorage",
        "state.vscdb",
      ),
      join(localAppData, "Cursor", "User", "globalStorage", "state.vscdb"),
      join(
        localAppData,
        "Programs",
        "Cursor",
        "User",
        "globalStorage",
        "state.vscdb",
      ),
    ];
  }

  return [
    join(home, ".config/Cursor/User/globalStorage/state.vscdb"),
    join(home, ".config/cursor/User/globalStorage/state.vscdb"),
  ];
}

const normalize = (value) => {
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "string" ? parsed : value;
  } catch {
    return value;
  }
};

/**
 * Extract tokens via better-sqlite3 (bundled dependency).
 * This is the preferred strategy — no external CLI required.
 */
async function extractTokensViaBetterSqlite(dbPath) {
  // Dynamic import so the route stays importable even if native bindings fail
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });

  const query = (key) => {
    const row = db.prepare("SELECT value FROM itemTable WHERE key=? LIMIT 1").get(key);
    return row?.value || null;
  };

  const normalize = (value) => {
    if (typeof value !== "string") return value;
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "string" ? parsed : value;
    } catch {
      return value;
    }
  };

  let accessToken = null;
  for (const key of ACCESS_TOKEN_KEYS) {
    const raw = query(key);
    if (raw) { accessToken = normalize(raw); break; }
  }

  let machineId = null;
  for (const key of MACHINE_ID_KEYS) {
    const raw = query(key);
    if (raw) { machineId = normalize(raw); break; }
  }

  // Fuzzy fallback for newer/changed key names (macOS only)
  if (process.platform === "darwin" && (!accessToken || !machineId)) {
    try {
      const fallbackRows = db.prepare(
        "SELECT key, value FROM itemTable WHERE key LIKE '%cursorAuth/%' OR key LIKE '%machineId%' OR key LIKE '%serviceMachineId%'"
      ).all();

      for (const row of fallbackRows) {
        const key = row.key || "";
        const value = normalize(row.value);

        if (!accessToken && key.toLowerCase().includes("accesstoken")) {
          accessToken = value;
        }

        if (!machineId && key.toLowerCase().includes("machineid")) {
          machineId = value;
        }
      }
    } catch {
      // Ignore fallback errors
    }
  }

  db.close();
  return { accessToken, machineId };
}

/**
 * Extract tokens via sqlite3 CLI.
 * Fallback when better-sqlite3 native bindings are unavailable.
 */
async function extractTokensViaCLI(dbPath) {
  const normalize = (raw) => {
    const value = raw.trim();
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "string" ? parsed : value;
    } catch {
      return value;
    }
  };

  const query = async (sql) => {
    const { stdout } = await execFileAsync("sqlite3", [dbPath, sql], {
      timeout: 10000,
    });
    return stdout.trim();
  };

  // Try each key in priority order
  let accessToken = null;
  for (const key of ACCESS_TOKEN_KEYS) {
    try {
      const raw = await query(
        `SELECT value FROM itemTable WHERE key='${key}' LIMIT 1`,
      );
      if (raw) {
        accessToken = normalize(raw);
        break;
      }
    } catch {
      /* try next */
    }
  }

  let machineId = null;
  for (const key of MACHINE_ID_KEYS) {
    try {
      const raw = await query(
        `SELECT value FROM itemTable WHERE key='${key}' LIMIT 1`,
      );
      if (raw) {
        machineId = normalize(raw);
        break;
      }
    } catch {
      /* try next */
    }
  }

  return { accessToken, machineId };
}

/**
 * GET /api/oauth/cursor/auto-import
 * Auto-detect and extract Cursor tokens from local SQLite database.
 * Strategy: better-sqlite3 → sqlite3 CLI → manual fallback
 */
export async function GET() {
  try {
    const platform = process.platform;
    if (platform !== "darwin" && platform !== "linux" && platform !== "win32") {
      return NextResponse.json(
        { found: false, error: "Unsupported platform" },
        { status: 400 }
      );
    }

    const candidates = getCandidatePaths(platform);

    let dbPath = null;
    if (platform === "darwin") {
      for (const candidate of candidates) {
        try {
          await access(candidate, constants.R_OK);
          dbPath = candidate;
          break;
        } catch {
          // Try next candidate
        }
      }
      if (!dbPath) {
        return NextResponse.json({
          found: false,
          error: "Cursor database not found in known macOS locations. Make sure Cursor IDE is installed and opened at least once.",
        });
      }
    } else {
      dbPath = candidates[0];
    }

    // On Linux, verify Cursor is actually installed (not just leftover config)
    if (platform === "linux" && !process.env.VITEST) {
      let cursorInstalled = false;
      try {
        await execFileAsync("which", ["cursor"], { timeout: 5000 });
        cursorInstalled = true;
      } catch {
        try {
          const desktopFile = join(homedir(), ".local/share/applications/cursor.desktop");
          await access(desktopFile, constants.R_OK);
          cursorInstalled = true;
        } catch { /* not found */ }
      }
      if (!cursorInstalled) {
        return NextResponse.json({
          found: false,
          error: "Cursor config files found but Cursor IDE does not appear to be installed. Skipping auto-import.",
        });
      }
    }

    let tokens = null;
    let sqliteError = null;

    // Strategy 1: better-sqlite3 (bundled — no external tools required)
    try {
      const result = await extractTokensViaBetterSqlite(dbPath);
      if (result.accessToken && result.machineId) {
        tokens = result;
      }
    } catch (err) {
      if (err.code !== "MODULE_NOT_FOUND" && !err.message.includes("Cannot find module")) {
        sqliteError = err;
      }
    }

    // Strategy 2: sqlite3 CLI
    if (!tokens) {
      try {
        const result = await extractTokensViaCLI(dbPath);
        if (result.accessToken && result.machineId) {
          tokens = result;
        }
      } catch (err) {
        if (!sqliteError) {
          sqliteError = err;
        }
      }
    }

    if (tokens && tokens.accessToken && tokens.machineId) {
      return NextResponse.json({
        found: true,
        accessToken: tokens.accessToken,
        machineId: tokens.machineId,
      });
    }

    if (sqliteError) {
      if (platform === "darwin") {
        return NextResponse.json({
          found: false,
          error: `Found Cursor database at ${dbPath} but could not open it: ${sqliteError.message}`,
        });
      } else {
        return NextResponse.json({
          found: false,
          error: "Cursor database not found. Make sure Cursor IDE is installed and you are logged in.",
        });
      }
    }

    // Strategy 3: ask user to paste manually
    if (platform === "darwin") {
      return NextResponse.json({
        found: false,
        error: "Please login to Cursor IDE first so we can extract your credentials.",
      });
    }

    return NextResponse.json({ found: false, windowsManual: true, dbPath });
  } catch (error) {
    console.log("Cursor auto-import error:", error);
    return NextResponse.json(
      { found: false, error: error.message },
      { status: 500 },
    );
  }
}
