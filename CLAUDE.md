# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**9Router** (`9router-app`, currently `0.4.63`) is a local AI routing gateway built on Next.js. It exposes a single OpenAI-compatible endpoint (`/v1/*`) that routes traffic across 40+ upstream AI providers, with format translation, multi-tier fallback, OAuth lifecycle management, RTK token compression, and a web dashboard for configuration.

The repo distributes itself two ways:
- As this Next.js app (`9router-app`, private)
- As a separate npm package `9router` (in `cli/`) that bootstraps a runtime under `~/.9router/runtime` and spawns the standalone Next.js server

## Commands

### Development
```bash
npm run dev            # Next dev on PORT=20128 (webpack)
npm run build          # Production build (output: standalone)
npm run start          # Run production build
npm run dev:bun        # Same as dev, via Bun runtime
npm run start:bun      # Run standalone build via Bun
```

Required env to run end-to-end (see `.env.example`): `JWT_SECRET`, `INITIAL_PASSWORD`, `DATA_DIR`, plus `BASE_URL`/`NEXT_PUBLIC_BASE_URL` if cloud sync is exercised.

### Tests
Tests live in a separate workspace (`tests/`) using Vitest, intentionally hoisted to `/tmp/node_modules` to sidestep the root Next.js workspace. From the repo root:
```bash
cd /tmp && npm install vitest        # one-time
cd tests && npm test                  # all unit tests
cd tests && NODE_PATH=/tmp/node_modules /tmp/node_modules/.bin/vitest run unit/embeddingsCore.test.js   # single file
```
There is no project-level `npm test` — the root `package.json` does not declare one.

### Lint
```bash
npx eslint .          # uses eslint.config.mjs + eslint-config-next
```

### Docker
```bash
docker build -t 9router .
docker run -p 20128:20128 -v 9router-data:/app/data 9router
```
The Dockerfile copies `open-sse/` and `src/mitm/` explicitly because Next file tracing can miss them; do not assume `next.config.mjs` standalone output covers everything.

## Architecture

### Two source trees, one process

The codebase is split into two top-level directories that work together:

- **`src/`** — Next.js App Router code: dashboard pages, REST API routes, persistence layer, auth, dashboard-specific SSE adapters.
- **`open-sse/`** — provider-agnostic routing core: per-provider executors, format translators, RTK token compression, account/combo fallback. Designed to be portable (also used by the `cloud/` worker referenced in tests).

When working on routing/translation logic, edit `open-sse/`. When working on dashboard, configuration storage, or HTTP-layer auth, edit `src/`.

### Request lifecycle (`/v1/chat/completions`)

1. `next.config.mjs` rewrites `/v1/*` → `/api/v1/*` (and `/v1/v1/*` → `/api/v1/*` to handle CLI tools that double-prefix).
2. `src/app/api/v1/chat/completions/route.js` calls `src/sse/handlers/chat.js` which:
   - Validates API key (only when `settings.requireApiKey === true`); validation in `src/sse/services/auth.js`.
   - Calls `parseModel(modelStr)` (`open-sse/services/model.js`) which splits `prefix/model-id` and resolves prefix via the hardcoded `ALIAS_TO_PROVIDER_ID` map.
   - Detects combo names (multi-model fallback sequence) and loops over them with `handleComboChat`.
3. `open-sse/handlers/chatCore.js` orchestrates: format detection → request translation → executor dispatch → 401/403 retry with `refreshCredentials()` → response stream translation back to client format.
4. `open-sse/services/accountFallback.js` decides whether an error is fallback-eligible; on fallback, the next account or next combo model is tried.
5. Usage is persisted by `src/lib/db/repos/usageRepo.js` (`saveRequestUsage`).

`/v1/models` (`src/app/api/v1/models/route.js`) currently has **no auth guard** — even when `requireApiKey=true`, the model list is fully public. This is a known gap, not an oversight to copy from when adding new endpoints.

### Persistence: SQLite, not JSON

Despite older docs referencing `db.json`, the active store is SQLite:
- `src/lib/localDb.js` is a re-export shim over `src/lib/db/`.
- Two adapters in `src/lib/db/adapters/`: `better-sqlite3` (native, optional dep) with `sql.js` (WASM) fallback. Don't assume native is available.
- Schema is **declarative** in `src/lib/db/schema.js` (`TABLES` object). For destructive changes write a numbered migration in `src/lib/db/migrations/` and bump `SCHEMA_VERSION`. Non-destructive table/column/index additions are picked up automatically by `syncSchemaFromTables()`.
- File location: `${DATA_DIR}/9router.db` (default `~/.9router/9router.db`). `usageDb`'s files (`usage.json`, `log.txt`) are **not** under `DATA_DIR` — they hardcoded to `~/.9router`.
- `exportDb()` / `importDb()` in `src/lib/db/index.js` produce/consume a JSON payload covering all repos. **`importDb()` wipes every table then re-inserts** — there is no merge mode.

### Provider system (two layers, must stay in sync)

Provider identity exists in two places that must be edited together:
- **UI layer**: `src/shared/constants/providers.js` — `AI_PROVIDERS` object with `{ id, alias, name, ... }` per provider; helpers `getProviderAlias()`, `ALIAS_TO_ID`, `ID_TO_ALIAS` derive from it.
- **Routing layer**: `open-sse/services/model.js:1-141` — hardcoded `ALIAS_TO_PROVIDER_ID` map used for parsing inbound model strings.

Adding a built-in provider means adding entries in both. Custom user-added providers (`providerNodes` table) carry their own `prefix` field and don't need code changes.

### Executors

Specialized executors in `open-sse/executors/`:
`antigravity`, `azure`, `codex`, `commandcode`, `cursor`, `gemini-cli`, `github`, `grok-web`, `iflow`, `kiro`, `ollama-local`, `opencode`, `opencode-go`, `perplexity-web`, `qoder`, `qwen`, `vertex`. Anything else falls through to `default.js` (assumes OpenAI-compatible). Each executor implements `execute()` and `refreshCredentials()`.

### Translators

`open-sse/translator/` is a registry-driven system that converts between source format (detected from request shape) and target format (per-provider config). Source formats: `openai`, `openai-responses`, `claude`, `gemini`. Translation runs **before** RTK compression for output but **after** for input — keep this ordering when adding new transforms.

### RTK Token Saver

`open-sse/rtk/` peeks the first ~1KB of each `tool_result` and applies a filter (`git-diff`, `git-status`, `grep`, `find`, `ls`, `tree`, `dedup-log`, `smart-truncate`, `read-numbered`, `search-list`). Safe-by-default: any filter throw or output-bigger-than-input falls back to original text. Toggleable per-endpoint in dashboard settings.

### MITM proxy

`src/mitm/` runs as a **separate child process** spawned from `server.js`. It generates self-signed certs (via `node-forge` + `selfsigned`) to capture OAuth tokens from CLI tools that pin to vendor URLs. The Dockerfile explicitly copies `src/mitm/` and `node_modules/node-forge` because Next tracing misses the child entry point.

### Cloud sync

Periodic sync to `CLOUD_URL` (default `https://9router.com`) is scheduled by `src/shared/services/cloudSyncScheduler.js` and gated by `settings.cloudEnabled`. Server-side prefer `BASE_URL`/`CLOUD_URL`; the public `NEXT_PUBLIC_*` variants exist only for UI compatibility. Sync uses fail-fast timeouts so cloud unreachability doesn't hang local UI.

## Conventions That Aren't Obvious

- **Don't add `console.log` for new errors** — use `src/sse/utils/logger.js`. Existing routes mostly already do this; the few `console.log` calls in `src/app/api/settings/database/route.js` are legacy.
- **Default `requireApiKey` is `false`** — most handlers gate behind `if (settings.requireApiKey)`. New endpoints under `/v1/*` should follow the same pattern; `/v1/models` is the outlier and likely should be brought in line if you touch it.
- **`apiKeys` table currently has no allowlist columns** — `validateApiKey()` only checks `isActive`. There is no per-key model/provider/quota enforcement; adding one means new columns + checks in handlers + UI.
- **Build assumes `output: "standalone"`** — see `next.config.mjs`. `gitbook/` is excluded from tracing on purpose (~50MB savings).
- **`cli/` (npm package `9router`) is not the same as this repo's app** — its `cli.js` self-heals SQLite runtime deps into `~/.9router/runtime` then spawns the Next standalone server. Don't conflate when reading `package.json` between root and `cli/`.

## Key Reference Files

When unsure where something lives, start with these:
- `docs/ARCHITECTURE.md` — authoritative architecture doc with mermaid diagrams
- `src/lib/db/schema.js` — single source of truth for SQLite schema
- `src/lib/db/index.js` — full export/import payload shape
- `open-sse/services/model.js` — prefix/alias parsing entry point
- `src/sse/handlers/chat.js` — main entry into the routing core
- `next.config.mjs` — URL rewrite rules and standalone build config
- `.env.example` — exhaustive list of recognised env vars
