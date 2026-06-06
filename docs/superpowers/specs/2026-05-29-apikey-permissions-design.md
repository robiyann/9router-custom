# Per-API-Key Access Control — Design Spec

**Status**: Draft
**Author**: 9Router team
**Date**: 2026-05-29
**Target version**: 0.5.x

---

## 1. Goal

Enable per-API-key access control so the operator can restrict which models, providers, and combos each API key may use. Default behavior remains unchanged for existing keys (allow-all) so the rollout is non-breaking.

This unlocks two future capabilities that are explicitly **out of scope for this spec** but should remain easy to add:
- USD/token quota per key
- Time-based access windows

## 2. Non-goals

- Quota enforcement (cost, tokens) — separate spec
- Rate limiting per key
- Multi-tenant authentication (group/role/user)
- Renaming or restructuring existing built-in provider prefixes

## 3. Current state

Verified by direct code inspection on 2026-05-29:

- DB is SQLite (not `db.json`). Schema declared in `src/lib/db/schema.js`.
- Table `apiKeys` columns today: `id, key, name, machineId, isActive, createdAt`. Indexed by `key`.
- `validateApiKey(key)` (`src/lib/db/repos/apiKeysRepo.js:70-75`) only checks `isActive=1`.
- API key auth in handlers gated by `settings.requireApiKey`. Pattern repeated in:
  `src/sse/handlers/{chat,embeddings,fetch,imageGeneration,search,stt,tts}.js`
- `GET /v1/models` (`src/app/api/v1/models/route.js:419-432`) currently has **no auth**.
- Provider prefixes (`cc`, `kr`, `glm`, ...) live in two hardcoded places that must stay in sync: `src/shared/constants/providers.js` (UI) and `open-sse/services/model.js:1-141` (routing). This spec does not modify them.

## 4. Design choices (from brainstorming)

| Decision | Choice |
|---|---|
| Granularity | Hybrid: prefix allowlist + per-model overrides + combo allowlist |
| Default for existing keys | `permissions = NULL` ⇒ allow-all (backward-compat) |
| Endpoint scope | All `/v1/*` request handlers + filter `/v1/models` + require API key for `/v1/models` (controlled by new setting `requireApiKeyForModels`, default `true`) |
| Combo handling | Separate combo allowlist (combos resolved by name, not by member-model membership) |
| Error response | HTTP 403 with explicit message + machine-readable code |
| UI location | New page `Dashboard → API Keys` |
| Caching | In-memory cache with TTL + explicit invalidation on update/delete |
| Wildcards | Only `prefix/*` (allow all under a prefix) and exact `prefix/model-id`. No regex / glob. |

## 5. Data model

### 5.1 Migration `002-apikey-permissions.js`

```sql
ALTER TABLE apiKeys ADD COLUMN permissions TEXT;  -- nullable JSON
```

- Idempotent: check `PRAGMA table_info(apiKeys)` before altering.
- Bump `SCHEMA_VERSION` from `1` to `2` in `src/lib/db/schema.js`.
- Migration runs automatically via `src/lib/db/migrate.js`.

### 5.2 `permissions` JSON shape

```json
{
  "mode": "allow_all" | "restricted",
  "allowedPrefixes": ["kr", "glm"],
  "allowedModels":   ["cu/claude-opus-4-7", "cc/*"],
  "deniedModels":    ["kr/claude-experimental"],
  "allowedCombos":   ["my-stack"]
}
```

Field rules:
- `mode === "allow_all"` or `permissions === null` ⇒ allow everything (selesai)
- `mode === "restricted"` ⇒ apply allow/deny resolution
- Any list field missing or `undefined` ⇒ treat as empty array
- `deniedModels` always wins over `allowedModels` and `allowedPrefixes`

### 5.3 Resolution algorithm (frozen)

```
INPUT: permissions, kind ∈ {"model","combo"}, target

1. permissions == null OR permissions.mode == "allow_all"   → ALLOW
2. kind == "combo":
     return target ∈ allowedCombos ? ALLOW : DENY
3. kind == "model" (target = "prefix/model-id"):
   3a. exists pattern in deniedModels matching target  → DENY
   3b. exists pattern in allowedModels matching target → ALLOW
   3c. prefix(target) ∈ allowedPrefixes                → ALLOW
   3d. else                                             → DENY
```

Pattern match: `pattern == target` OR `pattern.endsWith("/*") && target.startsWith(pattern[:-1])`.

### 5.4 Cache

In-memory `Map<key, { isActive, permissions, cachedAt }>` with:
- TTL: 5 minutes
- Invalidation: explicit `invalidateKey(key)` on `updateApiKey`, `updatePermissions`, `deleteApiKey`; `invalidateAllKeys()` on `importDb`
- Single-instance assumption documented in CLAUDE.md

## 6. Module layout

### 6.1 New module

`src/lib/auth/apiKeyPermissions.js` exports:
- `getKeyContext(key) → { isActive, permissions } | null`  *(uses cache)*
- `checkPermission(permissions, kind, target) → { allowed: bool, reason?: string }`
- `invalidateKey(key)`, `invalidateAllKeys()`

### 6.2 Touched files

| File | Change |
|---|---|
| `src/lib/db/schema.js` | bump `SCHEMA_VERSION`; add `permissions: "TEXT"` to `apiKeys.columns` |
| `src/lib/db/migrations/002-apikey-permissions.js` | new migration |
| `src/lib/db/repos/apiKeysRepo.js` | add `getApiKeyByKey()`, `updatePermissions(id, perms)`; call invalidate hooks |
| `src/lib/db/index.js` | extend `exportDb()`/`importDb()` to include `permissions` field |
| `src/sse/handlers/chat.js` | enforce `checkPermission` (combo + model) |
| `src/sse/handlers/embeddings.js` | enforce model |
| `src/sse/handlers/fetch.js` | enforce model |
| `src/sse/handlers/imageGeneration.js` | enforce model |
| `src/sse/handlers/search.js` | enforce model |
| `src/sse/handlers/stt.js` | enforce model |
| `src/sse/handlers/tts.js` | enforce model |
| `src/app/api/v1/models/route.js` | require API key + filter response by permissions |

### 6.3 New REST endpoints

```
GET    /api/keys                        — list with permissions summary
POST   /api/keys                        — create (optional initial permissions)
PATCH  /api/keys/[id]                   — rename, regenerate, toggle active
PUT    /api/keys/[id]/permissions       — replace permissions JSON
DELETE /api/keys/[id]                   — delete
GET    /api/keys/[id]/test?model=kr/x   — test access without upstream call
GET    /api/providers/list-with-models  — for UI multi-select autocomplete
GET    /api/combos/names                — for combos picker
```

## 7. Error contract

When `checkPermission` denies:

```json
HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "error": {
    "message": "Model \"glm/glm-experimental\" not allowed for this API key",
    "type": "permission_denied",
    "code": "model_not_allowed"
  }
}
```

Codes:
- `model_not_allowed` — request specified a model that resolves to deny
- `combo_not_allowed` — request specified a combo not in `allowedCombos`

`/v1/models` without API key when feature is active: `401 Unauthorized` with the existing OpenAI-shaped error envelope.

## 8. Edge cases

| Case | Behavior |
|---|---|
| `requireApiKey=false` + key sent | Honor allowlist |
| `requireApiKey=false` + no key | Bypass permission check (current local-only mode) |
| Combo name collides with provider prefix | Combo resolves first (existing behavior in `chat.js`) |
| `permissions` JSON corrupt | Treat as null + warn log (fail-open) |
| `mode=restricted` with all empty lists | Deny everything (explicit user choice) |
| Combo deleted while still in `allowedCombos` | Pass permission check, fail later with existing "combo not found" error |
| Concurrent permission edit during in-flight request | TTL ≤5 min ensures convergence; cache invalidated immediately on save |

## 9. UI

### 9.1 Sidebar entry

New item **"API Keys"** with icon `key`, between Endpoint and Combos.

### 9.2 List page `/dashboard/api-keys`

Table columns: Name (inline-editable), Key (masked + copy + reveal), Mode (badge), Access (live summary), Actions (gear + dot menu).
Empty state: illustration + CTA "Create API key".

### 9.3 Create modal

Two-step inline:
1. Name + mode toggle (Allow all / Restricted).
2. If Restricted: continue to permission editor in same modal.

### 9.4 Permission editor (heart of the feature)

Three tabs: **Providers**, **Models**, **Combos**.

- **Providers**: checkbox list grouped "Connected" vs "Available". Search box. Live count "X prefixes selected — covers Y models".
- **Models**: collapsible per-prefix groups with `Select all`. Filter box. Bottom section "Deny list (override)" with chip-style add/remove.
- **Combos**: simple checkbox list of all user combos.

Friendly touches (mandated):
- Live "Summary" footer
- "Test access" inline input that calls `GET /api/keys/[id]/test?model=...`
- Inline `?` tooltips
- All tabs disabled with banner when mode = Allow all
- Search/filter on long lists
- Sticky save footer
- Unsaved-changes confirmation
- Optimistic UI + toast
- "Copy from existing key" dropdown in create modal
- Reveal key requires confirmation modal (auto-hide 10s)

### 9.5 Mobile

- Table → card stack
- Modal → full-screen with top tabs
- Save floats at bottom

### 9.6 Onboarding banner

One-time at top of page after upgrade:
> *"New: per-key access control. Existing keys keep allow-all by default — click any key to restrict access."*

## 10. Testing

### 10.1 Unit (Vitest, in `tests/unit/`)

| File | Coverage |
|---|---|
| `apiKeyPermissions.test.js` | All resolution branches; ≥20 cases (allow_all, prefix-only, model-only, deny override, combo, wildcard, missing fields) |
| `apiKeyPermissions.cache.test.js` | TTL, invalidate single, invalidate all |
| `apiKeyPermissions.migration.test.js` | Idempotent migration; existing rows ⇒ NULL ⇒ allow-all |
| `chat-handler-permissions.test.js` | 403 body shape on deny; pass-through on allow |
| `models-route-filter.test.js` | Filter by permissions; 401 when key absent and feature active |

### 10.2 Manual smoke (pre-merge)

1. Create 3 keys: A (allow_all), B (restricted: kr+glm), C (combo only).
2. `curl /v1/models` no key → 401.
3. `curl /v1/models` with A → full list.
4. `curl /v1/models` with B → only `kr/*` and `glm/*`.
5. Chat with B using `cc/claude-opus-4-7` → 403 with explicit message.
6. Chat with C using combo `my-stack` → allow.
7. Chat with C using `kr/claude-sonnet-4.5` directly → 403.
8. Edit B's permissions in UI → next request honors immediately (cache invalidated).
9. Restart server → permissions persist; cache rebuilds on first hit.
10. `GET /api/settings/database` → confirm `permissions` field present in `apiKeys[]`. Re-import → state preserved.

### 10.3 Performance budget

- `checkPermission` p99 < 1ms with 1000 entries in any list
- Cache hit < 0.05ms

## 11. Rollout (one PR per phase)

| Phase | Scope | User-visible? |
|---|---|---|
| 1 | Schema migration + helper module + repo updates + unit tests | No |
| 2 | Enforcement in 7 handlers + `/v1/models` auth+filter | Only for keys with non-null permissions (none yet) |
| 3 | REST endpoints (permissions PUT, test, autocomplete) | API only |
| 4 | UI: API Keys page + modals | Yes — full feature |
| 5 | Polish: onboarding banner, copy-from, empty states | Refinement |

Each phase independently mergeable. After Phase 3, power users can configure via curl.

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Cache stale across multi-instance deploy | TTL 5 min as self-heal; document single-instance assumption |
| Self-lockout via misconfiguration | Dashboard auth uses JWT cookie (separate from API key) — unaffected |
| Breaking unauthenticated `/v1/models` consumers | Settings flag `requireApiKeyForModels` (default `true` post-phase-2; opt-out available); CHANGELOG entry |
| Corrupt permissions JSON blocking traffic | Fail-open: warn + treat as allow-all |
| Performance regression in hot path | Cache + benchmark in CI |
| User confusion ("why was I blocked?") | Explicit 403 message includes target + key id reference; UI test playground for pre-flight check |

## 13. Observability

- New log line `AUTH PERMISSION` on every 403, written via `src/sse/utils/logger.js`. Fields: `keyId`, `kind`, `target`, `reason`. Persisted to `~/.9router/log.txt`.
- `usageHistory.meta` extended with `permissionDenied: true` for analytics aggregation (no schema change — `meta` is already TEXT JSON).

## 14. Future hooks (not in this spec, but designed-for)

- Add `quotaUsd: { limit, used, resetPeriod }` to same `permissions` JSON column → no migration needed
- Add `accessWindow: { weekdays, hours }` similarly
- Add `keyPrefix` separator (e.g. `tenant-A.sk-9r-...`) for multi-tenancy without schema change

## 15. References

- `src/lib/db/schema.js` — schema source of truth
- `src/lib/db/migrate.js` — migration framework
- `src/sse/handlers/chat.js:60-115` — current auth flow to mirror
- `src/app/api/v1/models/route.js:419-432` — current public endpoint to harden
- `open-sse/services/model.js:151-172` — `parseModel` produces the `prefix/model` shape we match against
- `docs/ARCHITECTURE.md` — high-level architecture context
