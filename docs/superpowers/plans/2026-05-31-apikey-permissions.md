# Rencana Implementasi: Per-API-Key Access Control (5 Fase)

Rencana ini merinci implementasi per-API-Key access control sesuai dengan spesifikasi di `docs/superpowers/specs/2026-05-29-apikey-permissions-design.md`.

## Ringkasan Fase

### Fase 1: Migrasi Skema + Modul Helper + Pembaruan Repositori + Unit Test
- **Tujuan**: Menyiapkan struktur basis data, logika resolusi izin, caching, dan pengujian unit dasar.
- **Perubahan Berkas**:
  - `src/lib/db/schema.js`: Tingkatkan `SCHEMA_VERSION` ke `2`, tambahkan kolom `permissions TEXT` di tabel `apiKeys`.
  - `src/lib/db/migrations/002-apikey-permissions.js` [NEW]: Migrasi basis data dengan `ALTER TABLE apiKeys ADD COLUMN permissions TEXT;`.
  - `src/lib/db/migrations/index.js`: Registrasikan migrasi `002-apikey-permissions.js`.
  - `src/lib/auth/apiKeyPermissions.js` [NEW]: Ekspor fungsi `getKeyContext(key)`, `checkPermission(permissions, kind, target)`, `invalidateKey(key)`, dan `invalidateAllKeys()`. Implementasikan cache in-memory dengan TTL 5 menit.
  - `src/lib/db/repos/apiKeysRepo.js`: Tambahkan method/query untuk mengambil `permissions`, update permissions, dan panggil invalidasi cache.
  - `src/lib/db/index.js`: Sesuaikan fungsi `exportDb` dan `importDb` untuk menyertakan bidang `permissions`.
  - `tests/unit/apiKeyPermissions.test.js` [NEW]: Pengujian resolusi izin (allow_all, restricted, wildcard, deny overrides, combos).
  - `tests/unit/apiKeyPermissions.cache.test.js` [NEW]: Pengujian TTL cache dan invalidasi.
  - `tests/unit/apiKeyPermissions.migration.test.js` [NEW]: Pengujian migrasi basis data.

### Fase 2: Penegakan (Enforcement) di 7 SSE Handler & `/v1/models`
- **Tujuan**: Menghalangi permintaan yang tidak diizinkan oleh kunci API yang bersangkutan pada 7 endpoint utama dan memfilter daftar model yang dikembalikan.
- **Perubahan Berkas**:
  - `src/sse/handlers/chat.js`: Integrasikan checkPermission untuk model dan combo. Kirim 403 Forbidden dengan payload kesalahan standar jika ditolak.
  - Handler SSE lainnya: `embeddings.js`, `fetch.js`, `imageGeneration.js`, `search.js`, `stt.js`, `tts.js`.
  - `src/app/api/v1/models/route.js`: Memerlukan API key (jika pengaturan aktif) dan filter model berdasarkan izin kunci API tersebut.

### Fase 3: REST Endpoints Dashboard
- **Tujuan**: Menyediakan API kontrol untuk dashboard guna mendaftar, membuat, memperbarui, menghapus kunci, menyimpan izin, melakukan uji akses, dan autocomplete model/combo.
- **Rute Baru**:
  - `GET /api/keys` — daftar kunci dengan ringkasan izin.
  - `POST /api/keys` — pembuatan kunci baru dengan opsi izin awal.
  - `PATCH /api/keys/[id]` — rename, regenerasi, toggle aktif.
  - `PUT /api/keys/[id]/permissions` — simpan konfigurasi permissions JSON.
  - `DELETE /api/keys/[id]` — hapus kunci.
  - `GET /api/keys/[id]/test?model=...` — endpoint uji akses pre-flight.
  - `GET /api/providers/list-with-models` — daftar penyedia dan model untuk UI multi-select.
  - `GET /api/combos/names` — daftar combo untuk UI picker.

### Fase 4: Antarmuka Pengguna (UI) Dashboard
- **Tujuan**: Membangun UI yang intuitif dan kaya interaksi untuk mengelola kunci API dan izinnya.
- **Komponen**:
  - Sidebar: Tambahkan ikon "API Keys".
  - Halaman List `/dashboard/api-keys`: Tabel interaktif (nama dapat diedit langsung, masker kunci API, status aktif/nonaktif, ringkasan izin).
  - Modal Create & Permission Editor: Modal multi-tab (Providers, Models, Combos) dengan pencarian, toggle, denylist chip editor, dan live summary.
  - Fitur Playground: Bagian "Test access" inline di editor izin.

### Fase 5: UI Polish & Fitur Tambahan
- **Tujuan**: Menyelesaikan detail UX, performa, dan kemudahan penggunaan.
- **Fitur**:
  - Banner onboarding: Petunjuk bahwa kunci lama tetap memiliki akses "allow-all" secara default.
  - Copy dari kunci lain: Pilihan saat membuat kunci baru untuk menyalin izin kunci yang sudah ada.
  - Konfirmasi perubahan belum disimpan (unsaved changes checker).
  - Toast notifications & optimisasi respon UI.