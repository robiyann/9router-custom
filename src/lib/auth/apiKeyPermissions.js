import { getApiKeyByKey } from "../db/repos/apiKeysRepo.js";

// In-memory cache Map<key, { isActive, permissions, cachedAt }>
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Get API Key authorization context, using in-memory cache with TTL.
 * @param {string} key
 * @returns {Promise<{ isActive: boolean, permissions: any } | null>}
 */
export async function getKeyContext(key) {
  if (!key) return null;

  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.cachedAt < CACHE_TTL) {
    return {
      id: cached.id,
      isActive: cached.isActive,
      permissions: cached.permissions,
    };
  }

  try {
    const keyRecord = await getApiKeyByKey(key);
    if (!keyRecord) {
      return null;
    }

    const context = {
      id: keyRecord.id,
      isActive: keyRecord.isActive,
      permissions: keyRecord.permissions,
    };

    cache.set(key, {
      ...context,
      cachedAt: now,
    });

    return context;
  } catch (error) {
    console.error("[AUTH][apiKeyPermissions] Error fetching key context from DB:", error);
    return null;
  }
}

/**
 * Match a pattern wildcard or exact match
 * e.g. pattern "cc/*" matches target "cc/claude-opus"
 */
function matchPattern(pattern, target) {
  if (!pattern || !target) return false;
  if (pattern === target) return true;
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -1); // e.g. "cc/"
    return target.startsWith(prefix);
  }
  return false;
}

/**
 * Check if a request is allowed based on key permissions
 * @param {any} permissions
 * @param {"model" | "combo"} kind
 * @param {string} target
 * @returns {{ allowed: boolean, reason?: string, code?: string }}
 */
export function checkPermission(permissions, kind, target) {
  if (!permissions) {
    return { allowed: true };
  }

  if (typeof permissions !== "object") {
    return { allowed: true };
  }

  const deniedModels = permissions.deniedModels || [];

  // Denied models override every mode (including allow_all and missing/unknown).
  if (kind === "model" && deniedModels.some(p => matchPattern(p, target))) {
    return {
      allowed: false,
      reason: `Model "${target}" explicitly denied for this API key`,
      code: "model_not_allowed",
    };
  }

  // Treat as allow_all if mode is allow_all or if mode is not specified/corrupt
  if (permissions.mode === "allow_all" || !permissions.mode) {
    return { allowed: true };
  }

  if (permissions.mode !== "restricted") {
    // Fail-open for corrupt / unknown mode
    console.warn("[AUTH][apiKeyPermissions] Unknown mode, failing open:", permissions.mode);
    return { allowed: true };
  }

  const allowedCombos = permissions.allowedCombos || [];
  const allowedModels = permissions.allowedModels || [];
  const allowedPrefixes = permissions.allowedPrefixes || [];

  if (kind === "combo") {
    const allowed = allowedCombos.includes(target);
    if (allowed) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Combo "${target}" not allowed for this API key`,
      code: "combo_not_allowed",
    };
  }

  if (kind === "model") {
    // 3b. Allowed models
    if (allowedModels.some(p => matchPattern(p, target))) {
      return { allowed: true };
    }

    // 3c. Allowed prefixes
    const slashIdx = target.indexOf("/");
    const targetPrefix = slashIdx !== -1 ? target.substring(0, slashIdx) : "";
    if (targetPrefix && allowedPrefixes.includes(targetPrefix)) {
      return { allowed: true };
    }

    // 3d. Otherwise denied
    return {
      allowed: false,
      reason: `Model "${target}" not allowed for this API key`,
      code: "model_not_allowed",
    };
  }

  return { allowed: true };
}

/**
 * Invalidate in-memory cache for a single API key
 * @param {string} key
 */
export function invalidateKey(key) {
  if (key) {
    cache.delete(key);
  }
}

/**
 * Invalidate all cached API keys
 */
export function invalidateAllKeys() {
  cache.clear();
}
