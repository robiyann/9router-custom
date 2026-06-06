# 9Router - Dokumentasi Project

> Penjelasan lengkap proyek **9Router** (versi `0.4.63`) berdasarkan kode sumber di repo ini.

---

## 1. Apa itu 9Router?

**9Router** adalah **AI Router & Token Saver** lokal — sebuah gateway/proxy yang berjalan di mesin user (default port `20128`) dengan dashboard berbasis web. Tujuannya:

- Menyatukan semua AI coding tool (Claude Code, Cursor, Codex, Copilot, Gemini CLI, Cline, OpenClaw, Antigravity, Roo, Continue, dll) ke **satu endpoint OpenAI-compatible**: `http://localhost:20128/v1`.
- Merutekan request ke **40+ provider AI** dan **100+ model** (OpenAI, Anthropic, Gemini, GLM, MiniMax, Kimi, Kiro, Vertex AI, dll).
- Menghemat **20–40% token** per request lewat fitur **RTK Token Saver** (kompres output tool seperti `git diff`, `grep`, `ls` sebelum dikirim ke LLM).
- **Auto-fallback 3 tier**: Subscription → Cheap → Free, supaya developer "never stop coding" walau quota habis.
- **Format translation** otomatis: OpenAI ↔ Claude ↔ Gemini ↔ Cursor ↔ Kiro ↔ Vertex ↔ Antigravity ↔ Ollama.

Singkatnya: **satu endpoint untuk semua tool AI, dengan optimasi biaya & token otomatis.**

---

## 2. Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Framework | **Next.js 16** (App Router, output `standalone`) |
| UI | **React 19**, Tailwind CSS v4, Monaco Editor, Recharts, @xyflow/react |
| State (client) | Zustand |
| Backend runtime | Node.js (juga support Bun via `dev:bun` / `start:bun`) |
| Persistence | `sql.js` (default) / `better-sqlite3` (optional native), JSON files |
| Auth | JWT (`jose`), bcryptjs, cookie session |
| Networking | `undici`, `http-proxy-middleware`, `socks-proxy-agent` |
| OAuth/PKCE | `node-forge`, `selfsigned` (untuk MITM cert) |
| CLI | Native Node.js script (`cli/cli.js`) — distribusi via npm `9router` global |
| Container | Docker (`Dockerfile`, `DOCKER.md`) |

---

## 3. Struktur Folder Tingkat Atas

```
9router/
├── cli/                  # CLI bin (npm install -g 9router) — bootstrap runtime + tray
├── docs/                 # ARCHITECTURE.md (dokumen arsitektur otoritatif)
├── gitbook/              # Dokumentasi gitbook (di-exclude dari tracing build)
├── i18n/                 # README terjemahan (vi, zh-CN, ja-JP)
├── images/               # Asset gambar (banner README)
├── open-sse/             # ★ CORE routing & translation (provider-agnostic)
│   ├── config/
│   ├── executors/        # Executor per-provider (claude, codex, kiro, vertex, ...)
│   ├── handlers/         # chatCore.js — orchestrator utama
│   ├── rtk/              # RTK Token Saver (kompres tool_result)
│   ├── services/         # provider, model, accountFallback
│   ├── transformer/
│   ├── translator/       # Request/response translator antar format
│   └── utils/            # stream, usageTracking, proxyFetch
├── public/providers/     # Logo provider untuk UI
├── scripts/              # Utility scripts (translate-readme.js)
├── skills/               # Slash command / skill definitions
├── src/
│   ├── app/
│   │   ├── (dashboard)/dashboard/  # Halaman dashboard (Next.js route group)
│   │   │   ├── providers/      # CRUD provider connections
│   │   │   ├── combos/         # Custom fallback combos
│   │   │   ├── endpoint/       # API endpoint config
│   │   │   ├── usage/          # Analytics tokens/biaya
│   │   │   ├── quota/          # Tracking quota subscription
│   │   │   ├── cli-tools/      # Auto-config Claude Code/Codex/dll
│   │   │   ├── translator/     # Tools format translation
│   │   │   ├── mitm/           # MITM proxy untuk capture
│   │   │   ├── basic-chat/     # Test chat UI
│   │   │   ├── console-log/, profile/, skills/, media-providers/, proxy-pools/
│   │   │   └── page.js
│   │   ├── api/               # ★ Backend routes (lihat bagian 5)
│   │   ├── login/, callback/, landing/, layout.js, page.js
│   ├── lib/                   # Persistence + helpers infra
│   ├── mitm/                  # MITM HTTPS interceptor (untuk capture token CLI)
│   ├── models/                # Definisi model & alias
│   ├── proxy.js               # Express proxy fallback (auth cookie guard)
│   ├── shared/                # Shared utils (apiKey, cloud sync scheduler)
│   ├── sse/                   # Adapter dashboard ↔ open-sse core
│   └── store/                 # Zustand stores
├── tester/                    # Manual test scripts
├── tests/                     # Test suite
├── .env.example               # Contract env variable
├── Dockerfile, DOCKER.md
├── next.config.mjs            # Rewrites /v1/* → /api/v1/*
├── package.json               # name: 9router-app, version: 0.4.63
└── README.md                  # Marketing + setup guide
```

---

## 4. Komponen Inti

### 4.1 API & Routing Layer (Next.js App Routes)

Endpoint di-expose lewat rewrite `next.config.mjs`:

| Public path | Internal route |
|---|---|
| `POST /v1/chat/completions` | `/api/v1/chat/completions` (OpenAI-compatible) |
| `POST /v1/messages` | `/api/v1/messages` (Anthropic-compatible) |
| `POST /v1/responses` | `/api/v1/responses` (OpenAI Responses API) |
| `GET /v1/models` | `/api/v1/models` |
| `POST /v1/messages/count_tokens` | `/api/v1/messages/count_tokens` |
| `/v1beta/models/*` | Gemini-compatible |
| `/codex/*` | Alias ke `/api/v1/responses` |

**Management API** (di `src/app/api/*`):
- `auth/`, `settings/` — login + konfigurasi
- `providers/`, `provider-nodes/` — CRUD koneksi provider
- `oauth/[provider]/[action]/` — flow OAuth + device code
- `keys/`, `combos/`, `models/alias`, `pricing/` — config routing
- `usage/` — analytics
- `sync/cloud/`, `cloud/` — cloud sync optional
- `cli-tools/` — auto-tulis config ke `~/.claude/settings.json` dll
- `mcp/`, `mitm/`, `tunnel/`, `proxy-pools/`, `media-providers/`, `tags/`, `translator/`, `init/`, `health/`, `version/`, `shutdown/`, `locale/`

### 4.2 SSE + Translation Core (`open-sse/`)

Hati dari routing logic:

- **`open-sse/handlers/chatCore.js`** — orchestrator utama: deteksi format source, translate request, dispatch ke executor, handle 401/403 + auto-refresh token, normalize stream balik ke client.
- **`open-sse/executors/*`** — adapter per provider:
  - `claude`, `codex`, `cursor`, `antigravity`, `gemini-cli`, `github`, `kiro`, `vertex`, `iflow`, `qwen`, `qoder`, `ollama-local`, `opencode`, `opencode-go`, `grok-web`, `perplexity-web`, `azure`, `commandcode`, `default` (fallback untuk OpenAI-compatible nodes).
- **`open-sse/translator/`** — registry translator request/response antar format (`openai`, `openai-responses`, `claude`, `gemini`).
- **`open-sse/services/`**:
  - `provider.js` — config + format detection per provider
  - `model.js` — parsing model string (`prefix/model-name`)
  - `accountFallback.js` — logic kapan dianggap fallback-eligible (status code + heuristic error message)
- **`open-sse/rtk/`** — **RTK Token Saver**: deteksi 1KB pertama tool_result lalu kompres dengan filter (`git-diff`, `git-status`, `grep`, `find`, `ls`, `tree`, `dedup-log`, `smart-truncate`, `read-numbered`, `search-list`). Safe-by-design: kalau kompres gagal/lebih besar, output original tetap dipakai.
- **`open-sse/utils/`** — `stream.js`, `streamHandler.js`, `usageTracking.js`, `proxyFetch.js` (support `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`).

### 4.3 Persistence Layer

| File | Path | Isi |
|---|---|---|
| `src/lib/localDb.js` | `${DATA_DIR}/db.json` (default `~/.9router/db.json`) | providerConnections, providerNodes, modelAliases, combos, apiKeys, settings, pricing |
| `src/lib/usageDb.js` | `~/.9router/usage.json` + `~/.9router/log.txt` | Aggregat tokens/cost + textual request log |
| `src/lib/disabledModelsDb.js` | (di `~/.9router`) | Model yang user disable manual |
| `src/lib/requestDetailsDb.js` | (di `~/.9router`) | Detail request untuk debugging |
| Optional debug | `<repo>/logs/...` | Translator/request session log saat `ENABLE_REQUEST_LOGS=true` |

> ⚠️ **Catatan arsitektur**: `usageDb` saat ini *tidak* mengikuti `DATA_DIR` — selalu di `~/.9router`.

### 4.4 Auth & Security

- **Dashboard cookie auth** — `src/proxy.js` + `src/app/api/auth/login/route.js`. JWT signed pakai `JWT_SECRET`.
- **Initial password** — `INITIAL_PASSWORD` (default `123456` — **wajib diganti** di production).
- **API key generation** — `src/shared/utils/apiKey.js` pakai HMAC dengan `API_KEY_SECRET`.
- **Provider secrets** — disimpan di `db.json` (lindungi di filesystem level).
- **Cloud sync** — auth lewat API key + `machineId` (di-salt dengan `MACHINE_ID_SALT`).
- **MITM** — `src/mitm/` + `selfsigned`/`node-forge` untuk generate cert lokal (capture token dari CLI tool yang HTTPS).

### 4.5 Cloud Sync (Optional)

- `src/lib/initCloudSync.js` + `src/shared/services/cloudSyncScheduler.js` — periodic sync ke `CLOUD_URL` (default `https://9router.com`).
- Sinkronisasi: providers, aliases, combos, keys.
- Server-side prefer var `BASE_URL` & `CLOUD_URL`; backward-compatible dengan `NEXT_PUBLIC_*` versinya.
- Fail-fast timeout supaya UI tidak hang saat cloud unreachable.

---

## 5. Lifecycle Request `/v1/chat/completions`

```
Client (CLI)
  → POST /v1/chat/completions
    → src/app/api/v1/chat/completions/route.js
      → src/sse/handlers/chat.js (parse + combo loop)
        → resolve model / combo
        → pilih account credential (multi-account round-robin)
        → open-sse/handlers/chatCore.js
          → detect source format (openai/claude/gemini)
          → translate request → format target provider
          → RTK kompres tool_result (kalau enabled)
          → executor.execute() → upstream provider
          ← stream/JSON response
          → kalau 401/403: refreshCredentials() lalu retry
        → translate stream balik ke format client
      → catat usage di usageDb
    → SSE chunks balik ke client
```

### Combo + Account Fallback

```
model string
  ├─ combo? → loop tiap model di combo
  └─ single? → langsung
       ↓
  pilih account
       ↓
  execute → success? → return
                 fail? → fallback-eligible (5xx, rate-limit, token error)?
                            ↓ ya
                       cooldown account, coba account lain
                            ↓ habis
                       coba next model di combo
                            ↓ habis
                       return "all unavailable"
```

Logic: `open-sse/services/accountFallback.js`.

---

## 6. Provider Coverage

| Tipe | Provider |
|---|---|
| **OAuth** | Claude Code, Antigravity, Codex, GitHub Copilot, Cursor |
| **Free** | Kiro AI, OpenCode Free, Vertex AI ($300 credits) |
| **API Key (40+)** | OpenRouter, GLM, Kimi, MiniMax, OpenAI, Anthropic, Gemini, DeepSeek, Groq, xAI, Mistral, Perplexity, Together, Fireworks, Cerebras, Cohere, NVIDIA, SiliconFlow, Nebius, Chutes, Hyperbolic, custom OpenAI/Anthropic-compatible nodes |
| **Specialized executors** | `antigravity`, `gemini-cli`, `github`, `kiro`, `codex`, `cursor`, `vertex`, `iflow`, `qwen`, `qoder`, `ollama-local`, `opencode`, `grok-web`, `perplexity-web` |

Provider lain pakai `open-sse/executors/default.js` (asumsi OpenAI-compatible).

---

## 7. Environment Variables

| Var | Fungsi | Default |
|---|---|---|
| `JWT_SECRET` | Sign cookie session dashboard | **wajib di-set** |
| `INITIAL_PASSWORD` | Password awal dashboard | `123456` (ganti!) |
| `DATA_DIR` | Lokasi `db.json` | `~/.9router` |
| `API_KEY_SECRET` | HMAC API key generator | — |
| `MACHINE_ID_SALT` | Salt machine ID | — |
| `PORT` | Listen port | `20128` |
| `HOSTNAME` | Listen host | `0.0.0.0` (Docker) |
| `BASE_URL` / `NEXT_PUBLIC_BASE_URL` | Self URL untuk callback sync | `http://localhost:20128` |
| `CLOUD_URL` / `NEXT_PUBLIC_CLOUD_URL` | Cloud sync endpoint | `https://9router.com` |
| `ENABLE_REQUEST_LOGS` | Tulis full request/response ke `logs/` | `false` |
| `OBSERVABILITY_ENABLED` | Toggle metrics | `true` |
| `AUTH_COOKIE_SECURE` | Cookie `Secure` flag (HTTPS) | `false` |
| `REQUIRE_API_KEY` | Wajibkan API key di endpoint `/v1/*` | `false` |
| `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` / `NO_PROXY` | Outbound proxy untuk panggil provider | unset |

---

## 8. Cara Menjalankan

### A. Dari source (development)

```bash
cp .env.example .env
npm install
PORT=20128 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run dev
```
Akses: `http://localhost:20128/dashboard`

### B. Production build

```bash
npm run build
PORT=20128 HOSTNAME=0.0.0.0 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run start
```

### C. Bun (alternatif)

```bash
npm run dev:bun       # development
npm run build:bun     # build
npm run start:bun     # serve standalone
```

### D. Docker

Lihat `DOCKER.md` — image tersedia di Docker Hub `decolua/9router` & GHCR.

### E. Global CLI (npm)

```bash
npm install -g 9router
9router          # auto-bootstrap runtime + buka dashboard
```

> Package npm `9router` (di folder `cli/`) berbeda dari repo ini (`9router-app`). Folder `cli/` bertugas:
> - Self-heal dependency native (`sql.js` + `better-sqlite3`) ke `~/.9router/runtime`
> - Hook tray runtime
> - Spawn server Next.js standalone

---

## 9. Konfigurasi di CLI Tool

Setelah dashboard jalan, arahkan tool AI ke 9Router:

```
Endpoint: http://localhost:20128/v1
API Key:  [copy dari Dashboard → Endpoint]
Model:    kr/claude-sonnet-4.5  (atau combo-name custom)
```

Format model: `<provider-prefix>/<model-name>` atau nama combo. Contoh:
- `cc/claude-opus-4-7` → Claude Code subscription
- `glm/glm-4.7` → GLM
- `kr/claude-sonnet-4.5` → Kiro free
- `my-coding-stack` → combo custom (lihat Dashboard → Combos)

Halaman **Dashboard → CLI Tools** bisa auto-tulis config untuk Claude Code, Codex, Cursor, Cline, dll.

---

## 10. Fitur Unggulan

| Fitur | Lokasi kode | Kegunaan |
|---|---|---|
| **RTK Token Saver** | `open-sse/rtk/` | Kompres `tool_result` lossless, hemat 20-40% token |
| **Caveman Mode** | (prompt injection) | Inject prompt "caveman speak" → output LLM lebih ringkas |
| **3-Tier Fallback** | `open-sse/services/accountFallback.js` | Subscription → Cheap → Free auto-switch |
| **Quota Tracking** | `src/app/api/usage/*` | Real-time token + reset countdown (5h/daily/weekly) |
| **Format Translation** | `open-sse/translator/` | OpenAI ↔ Claude ↔ Gemini ↔ Cursor ↔ Kiro ↔ Vertex |
| **Multi-Account** | `localDb.providerConnections[]` | Round-robin antar akun per provider |
| **Auto Token Refresh** | `executor.refreshCredentials()` | OAuth refresh otomatis sebelum expired |
| **Custom Combos** | `localDb.combos` | Sequence model fallback unlimited |
| **Request Logging** | `ENABLE_REQUEST_LOGS=true` | Full request/response dump ke `logs/` |
| **Cloud Sync** | `src/shared/services/cloudSyncScheduler.js` | Sync config antar device |
| **Usage Analytics** | Dashboard → Usage | Cost estimation (display only, bukan billing real) |
| **MITM Proxy** | `src/mitm/` | Capture token dari CLI tool HTTPS |
| **Skills** | `skills/` | Slash command kustom |
| **MCP** | `src/lib/mcp/`, `src/app/api/mcp/` | Model Context Protocol integration |

> 💡 **Penting**: "cost" yang ditampilkan dashboard adalah **estimasi tracking**, bukan tagihan. 9Router gratis, user hanya bayar provider langsung kalau pakai paid tier.

---

## 11. Failure Modes & Resilience

1. **Account/Provider availability** — cooldown saat error transient + fallback antar account → fallback antar model di combo.
2. **Token expiry** — pre-check + refresh sebelum request, retry otomatis kalau 401/403.
3. **Stream safety** — disconnect-aware controller, end-of-stream flush, `[DONE]` handling, fallback estimasi usage kalau provider tidak kasih metadata.
4. **Cloud sync degradation** — error sync di-surface tapi runtime lokal tetap jalan.
5. **Data integrity** — schema migration + safeguard reset kalau JSON corrupt.

---

## 12. Catatan Arsitektur Penting

1. `usageDb` selalu di `~/.9router` (tidak follow `DATA_DIR`).
2. `/api/v1/route.js` return static list, **bukan** sumber utama `/v1/models`.
3. Request logger menulis full headers/body — `logs/` harus diperlakukan sebagai sensitif.
4. Cloud sync bergantung pada `BASE_URL`/`CLOUD_URL` benar dan reachable.
5. `optionalDependencies.better-sqlite3` sengaja optional — `sql.js` jadi fallback runtime kalau native build tools tidak ada.
6. `gitbook/` di-exclude dari `outputFileTracing` (hemat ~50MB di standalone build).
7. `next.config.mjs` punya rewrite quirk: `/v1/v1/*` → `/api/v1/*` (handle CLI tool yang nempel `/v1` dua kali).

---

## 13. Verifikasi Setup

```bash
# Build sukses
npm run build

# Server respon
curl http://localhost:20128/api/settings
curl http://localhost:20128/api/v1/models

# Health check
curl http://localhost:20128/api/health
```

---

## 14. Referensi Dokumen

- `README.md` — overview marketing + quick start
- `docs/ARCHITECTURE.md` — arsitektur otoritatif (sumber utama dokumen ini)
- `DOCKER.md` — instruksi container
- `CHANGELOG.md` — riwayat versi (current: `0.4.63`, 2026-05-26)
- `i18n/README.{vi,zh-CN,ja-JP}.md` — README terjemahan
- `gitbook/` — dokumentasi user-facing extended

---

## 15. Ringkasan TL;DR

> **9Router = local AI gateway berbasis Next.js + Node.js yang menyatukan 40+ AI provider ke satu OpenAI-compatible endpoint, dengan token saver (RTK), fallback 3-tier otomatis, format translation antar API, OAuth + multi-account management, dashboard web lengkap, dan opsi cloud sync. Cocok untuk developer yang pakai banyak AI coding tool dan mau optimasi biaya + reliability tanpa ganti tool.**

---

## 16. Kustomisasi & Fitur Tambahan (Custom Modifications)

Dokumentasi mengenai perubahan dan fitur kustom yang ditambahkan secara mandiri untuk kebutuhan pengelolaan skala besar:

### 16.1 Prefix Editor & Batch Prefix Tool
Fitur untuk mengedit dan memperbarui routing prefix secara massal untuk koneksi provider tertentu. Berguna jika Anda memiliki puluhan akun dan ingin merutekannya dengan prefix kustom secara cepat.

* **Fungsionalitas**:
  - Batas panjang prefix frontend & backend diperkuat maksimal **32 karakter** (regex: `^[a-z0-9-]+$`).
  - Halaman **Prefix Manager** terpusat untuk melihat dan memperbarui prefix model dari satu layar terintegrasi.
* **Modifikasi File**:
  - **Backend API**: [route.js (PUT /api/providers)](file:///c:/Users/Administrator/Documents/bot/9router/src/app/api/providers/route.js) – Aksi `batch-prefix`.
  - **Frontend UI**: 
    - [prefixes/page.js](file:///c:/Users/Administrator/Documents/bot/9router/src/app/(dashboard)/dashboard/providers/prefixes/page.js) – Halaman Manager Prefix + modal edit massal.
    - [providers/page.js](file:///c:/Users/Administrator/Documents/bot/9router/src/app/(dashboard)/dashboard/providers/page.js) – Tombol navigasi "Prefix Manager" di toolbar atas.
  - **Bug Fix Terkait**: [EditConnectionModal.js](file:///c:/Users/Administrator/Documents/bot/9router/src/shared/components/EditConnectionModal.js) – Memperbaiki crash `ReferenceError: existing is not defined` saat menyimpan koneksi tunggal.

### 16.2 Batch Delete Connections (Hapus Massal)
Fitur untuk menghapus koneksi akun secara cepat dan massal berdasarkan kriteria status (mati/error, nonaktif, atau semua) untuk menjaga kebersihan routing pool.

* **Fungsionalitas**:
  - Penghapusan dilakukan secara aman di dalam satu database transaksi SQLite atomik.
  - Setelah penghapusan massal, urutan prioritas fallback koneksi (`reorderInTx`) otomatis disusun ulang.
  - Pengamanan ekstra berupa verifikasi ketik kata kunci `"delete"` sebelum mengeksekusi penghapusan semua koneksi.
* **Kriteria Filter**:
  - `dead`: Koneksi yang gagal dalam pengujian (`testStatus` bernilai `error`, `expired`, atau `unavailable`).
  - `inactive`: Koneksi yang dinonaktifkan (`isActive === 0`).
  - `all`: Semua koneksi dalam lingkup provider yang dipilih.
* **Modifikasi File**:
  - **Database Layer**:
    - [connectionsRepo.js](file:///c:/Users/Administrator/Documents/bot/9router/src/lib/db/repos/connectionsRepo.js) – Menambahkan fungsi `batchDeleteProviderConnections({ providerId, filter })`.
    - [localDb.js](file:///c:/Users/Administrator/Documents/bot/9router/src/lib/localDb.js) & [models/index.js](file:///c:/Users/Administrator/Documents/bot/9router/src/models/index.js) – Re-ekspor fungsi repository.
  - **Backend API**: [route.js (DELETE /api/providers)](file:///c:/Users/Administrator/Documents/bot/9router/src/app/api/providers/route.js) – Aksi `batch-delete` dengan validasi token CLI.
  - **Frontend UI**:
    - **Global Batch Delete**: [providers/page.js](file:///c:/Users/Administrator/Documents/bot/9router/src/app/(dashboard)/dashboard/providers/page.js) – Menambahkan tombol & modal Batch Delete global (bisa memilih lintas provider).
    - **Local Batch Delete**: [providers/[id]/page.js](file:///c:/Users/Administrator/Documents/bot/9router/src/app/(dashboard)/dashboard/providers/[id]/page.js) – Menambahkan tombol & modal khusus provider detail saat ini.
    - **Bug Fix**: Memperbaiki `TypeError: bulkDeleteConfirmText.toLowerCase is not a function` pada Input `onChange` event dengan merujuk ke `e.target.value` daripada menyimpan event objek langsung ke react state.
