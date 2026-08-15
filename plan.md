# RENCANA EKSEKUSI — FONDASI MULTI-ENTITAS (Pengaturan Entitas · Pemilihan · Akun · Isolasi Data)

> **Sesi ini = VERIFIKASI SAJA. TIDAK ADA KODE FITUR YANG DIUBAH.**
> Rencana ini ditulis agar agen sesi berikutnya bisa langsung eksekusi tanpa menelusuri ulang.
> Plan sebelumnya (D-14 / Daftar Harga per Pelanggan — sudah selesai) diarsipkan ke
> `.logs/plan_archive_pre_ENTITAS.md`.
>
> **Bukti & temuan:** `AUDIT_ISOLASI_ENTITAS.md` (isolasi data) · `AUDIT_ENTITAS_2026-08-10.md`
> (pengaturan entitas & akun). **Alat audit:** `scripts/entity_audit/` (5 skrip, lihat §7).
> **Kredensial uji:** `memory/test_credentials.md` (semua akun demo password `demo12345`).

---

## 0) KONTEKS BISNIS (dari pemilik, jangan ditafsir ulang)

Multi-entitas di sini **bukan** multi-tenant SaaS. Ini **satu perusahaan** dengan **proses bisnis
identik**, dipecah menjadi beberapa **badan usaha** karena:
- perhitungan keuangan berbeda (buku, pajak, PKP/non-PKP),
- harga jual berbeda,
- basis pelanggan berbeda.

Konsekuensi yang WAJIB dipegang:
1. **Karyawan** bisa ditugaskan ke 1 entitas (tidak boleh lihat entitas lain **sama sekali**)
   atau ke >1 entitas (boleh berpindah, tetapi data tidak boleh tercampur).
   **Entitas karyawan bersumber dari modul HR** (`hr_employees.entity_id`) — bukan diketik ulang.
2. **Master data bersama** (produk, kategori, UOM, warna) tetap satu.
   **Semua transaksi & keuangan terpisah** per entitas (SO, PO, faktur, kas, jurnal, piutang).
3. **Jenis entitas bukan hanya PT** — bisa CV, **perorangan**, UD, koperasi, yayasan.
   NPWP boleh kosong (perorangan), PKP menyusul status pajaknya sendiri.
4. Jumlah entitas **bisa bertambah sampai puluhan** → UI wajib skalabel (cari, filter, paging).
5. **Pengaturan/konfigurasi sistem harus per entitas** dan UI-nya harus jelas dari mana nilai
   berasal (global vs entitas) — tidak boleh menyesatkan.

### Keputusan pemilik (jawaban verifikasi, verbatim ringkas)
| # | Pertanyaan | Keputusan |
|---|---|---|
| 1 | Sales lihat stok PT lain? | Sales lihat **detail stok entitasnya sendiri** + **angka global (agregat)**. **Detail per-entitas hanya di sisi admin/admin-sales.** (Pembagian domain sales vs admin sales sudah dibahas & dikunci — lihat FASE E-8.) |
| 2 | Semua modul pinggir wajib per-entitas? | **Ya.** Jejak audit: **opsi (a)** → **hanya admin**, dan **hanya entitas yang sedang aktif**. |
| 3 | Gudang | **(c) Campur** — ada gudang bersama, ada gudang khusus entitas tertentu. |
| 4 | Harga | **(a)** Harga master global + **override per entitas**; UI override **harus jelas**, dan nilai yang berasal dari global **wajib berlabel**. |
| 5 | Nomor dokumen | **(a)** Semua dokumen **wajib ber-prefix entitas**. Dokumen demo lama **dihapus**; **seed disesuaikan**. |
| 6 | Master/konfigurasi yang masih bersama | **Semuanya harus per entitas.** |
| + | Karyawan lintas-entitas | Ikuti pendaftaran di **HR** (`hr_employees.entity_id`) — termasuk gaji/insentif. |
| + | Pelanggan sama di 2 entitas | Dibiarkan apa adanya (record terpisah). **Tanpa** perlakuan khusus. Database pelanggan **tidak** dibagi. |

### Peran & domain kerja (keputusan pemilik — dipakai FASE E-8)
Sistem sekarang hanya punya 4 peran; akan menjadi **6**:
`admin` · `manager` · **`sales_admin` (baru)** · **`finance` (baru)** · `sales` · `warehouse`.

| Peran | Domainnya |
|---|---|
| **Sales (lapangan)** | Jual barang · basis pelanggan sendiri · buat SO · **lihat perjalanan pesanan** · **hanya SO miliknya** · **mengajukan retur**. Tidak mengurus operasional/manajemen, tidak menyentuh uang & pajak |
| **Admin Sales** | Pemilik alur SO **end-to-end**: verifikasi kelengkapan → **keputusan pemenuhan** (stok sendiri · **ambil dari PT lain** · **reorder ke supplier** · pegging, **tanpa** persetujuan manajer) → **konfirmasi SO** → dokumen (SJ/Invoice) → **memproses retur** yang diajukan sales · boleh menandai barang diterima. **Berbasis penugasan entitas** (1 atau beberapa PT) |
| **Finance / Kasir** | **Uang masuk (kwitansi AR)** · **Faktur Pajak keluaran** · selisih bayar (dalam batas config) · terbitkan denda · rencana pembayaran. Tidak membuat/mengonfirmasi SO |
| **Manager** | **Keputusan**: harga khusus · kredit · SO bernilai besar · persetujuan retur · pembebasan denda · settlement antar-PT · target & insentif |
| **Gudang** | Picking · packing · kirim · terima barang (termasuk barang antar-PT) · boleh menandai barang diterima |
| **Admin sistem** | Entitas · pengguna · master data · konfigurasi · izin |

Hirarki wewenang: `sales:1 · warehouse:1 · sales_admin:2 · finance:2 · manager:3 · admin:4`.

---

## 1) KONDISI FAKTUAL SISTEM (hasil verifikasi, dengan bukti)

### 1.1 Yang sudah BENAR (jangan dirusak saat refactor)
- `backend/entity_scope.py` — lapisan scoping terpusat: registry `SCOPE_FIELD`/`SCOPED_COLLECTIONS`,
  dependency `entity_ctx`, `resolve_list_scope`, `stamp_entity`, `assert_entity_access`.
- `services/entity_context_service.py` — `build_entity_context` (home/allowed/active), role
  lintas-entitas `{admin, manager}`, resolusi dinamis untuk admin/manager.
- Isolasi TERBUKTI (sales KSC vs sales Kanda): pelanggan 4↔1 · supplier 4↔2 · SO 8↔1 · PO 9↔4 ·
  mutasi stok 41↔2 · neraca saldo Rp 981.324.092 ↔ Rp 46.599.692 · kas kecil Rp 7,75 jt ↔ Rp 3,8 jt ·
  omzet bulan Rp 79,25 jt ↔ Rp 0 · karyawan/makloon/kontrak/harga-pelanggan terisi ↔ 0.
- Anti-IDOR terbukti 403/404: `sales-orders/{id}`, `purchase-orders/{id}`, `ar-receipts/{id}`,
  `sales-returns/{id}`, `suppliers/{id}`, `products/{id}/purchase-history`,
  `purchase-returns/source-rolls`, `uom-conversions/usage`.
- `X-Entity-Id: all` dari sales/gudang **diabaikan** (tetap entitasnya).
- Bagan akun bersama by-code + buku besar terpisah per entitas → trial balance benar per entitas.
- POC lama `backend/test_f0c_scoping_leak_poc.py` → **28 PASS / 0 FAIL**.

### 1.2 CACAT yang harus ditutup (semua sudah dibuktikan)

**A. Kebocoran lintas-entitas**
| Kode | Endpoint / berkas | Bukti | Akar masalah |
|---|---|---|---|
| L1 | `GET /api/notifications` (`routers/notifications.py`) | sales Kanda menerima `ntf_9f2bdb658c61` "Order menunggu persetujuan: SO-0007" (`entity_id=ent_ksc`) | `notifications` = SHARED di registry; filter hanya per user/role |
| L2 | `GET /api/payment-plans` | sales Kanda melihat 2/2 rencana KSC | tanpa `resolve_list_scope` |
| L3 | `GET /api/payment-variances` | sales Kanda melihat 4/4 keputusan KSC | idem |
| L4 | `GET /api/penalties` | sales Kanda melihat `pnl_3bddc1591159` (KSC) | idem |
| L5 | `GET /api/sales-targets` | target lintas-entitas terlihat | idem |
| L6 | `GET /api/sales-incentives` | insentif lintas-entitas terlihat | idem |
| L7 | `GET /api/audit-logs` (`routers/audit.py:14`) | **sales & gudang** membaca 66 baris jejak SELURUH grup | gerbang salah `require_permission("product","view")` + tanpa scope |
| L8 | `GET /api/lots/{id}` (`routers/lots.py`) | sales KSC buka lot Kanda → **200** | daftar ter-scope, detail tidak (`assert_entity_access` tidak dipakai) |
| L9 | `GET /api/ar/aging` (`routers/ar_aging.py:22`) | `entity_id` selalu `"all"`; total identik Rp 20.260.900 untuk KSC/KANDA/ALL | `aging_report(entity_id=None)` — konteks header tidak dibaca |
| L10 | `GET /api/settings/effective` (`routers/settings.py:29` → `services/config_service.py:202`) | header `X-Entity-Id=ent_kanda` → PPN 12% & `is_pkp=true`; `?entity_id=ent_kanda` → PPN 0% & `is_pkp=false` | endpoint tidak membaca `entity_ctx` |
| L11 | `hr_org_units` | 12 baris menunjuk entitas **yang sudah dihapus** (`ent_f39d5cfe1728`) | bootstrap menanam divisi per entitas aktif; tak ada pembersihan saat entitas hilang |
| L12 | `sales_targets`/`sales_incentives` | milik **Citra Lestari (sales Kanda)** tapi `entity_id=ent_ksc` | stempel salah di `seed_realistic.py` |

**A-lanjutan. Kebocoran & drift yang ditemukan pada verifikasi ANTAR-ENTITAS (2026-08-10, sesi yang sama)**
> Rincian & bukti: `AUDIT_ANTAR_ENTITAS.md`. Semuanya masuk lingkup **FASE E-0**.

| Kode | Temuan | Bukti / berkas |
|---|---|---|
| L13 | **`/api/transfers*` tanpa scoping entitas sama sekali** (list, detail, approve, reject, status, delete) | `routers/transfers.py:39,289,313,409,453,522`; gudang KSC membuka `TRF-00003` dengan konteks Kanda → **200** |
| L14 | `warehouse_transfers` **tidak terdaftar** di `SCOPED_COLLECTIONS`; 2 dari 5 dokumen (yang antar-PT) **tanpa `entity_id`** | pemindaian registry↔DB |
| L15 | **18 koleksi ber-`entity_id` tidak terdaftar** di registry (bukan SCOPED, bukan SHARED): `approval_rules`, `audit_logs`, `budgets`, `credit_notes`, `cycle_count_sessions`, `fin_budget_rules`, `payment_plans`, `payment_variance_decisions`, `penalties`, `purchase_returns`, `rfid_reads`, `rfid_tags`, `rnd_person_divisions`, `sales_incentives`, `sales_targets`, `supplier_price_lists`, `tax_invoices_in`, `warehouse_transfers` | skrip statik |
| L16 | **Drift nama koleksi**: registry mendaftarkan `input_tax_invoices` (tak ada di DB); data nyata di **`tax_invoices_in`** → faktur pajak masukan tak dijaga registry | registry↔DB |
| L17 | Pemindaian 52 router: **6 TANPA scoping** (`admin.py`, `documents.py`, `incentive_rates.py`, `landed_cost.py`, `payment_variance.py`, `pegging.py`) + **5 PARSIAL** (`crm.py`, `cycle_count.py`, `products.py`, `return_policies.py`, `transfers.py`) | skrip statik |
| L18 | **Cetak dokumen lintas-entitas**: `GET /api/documents/preview/{order_id}` → sales Kanda mencetak Surat Jalan `SO-0007` milik KSC (200, HTML lengkap) | empiris |
| L19 | **Jejak dokumen lintas-entitas**: `GET /api/documents/trace/sales_order/{id}` → sales KSC melihat `SO-0002` Kanda + nama pelanggannya | empiris |
| L20 | **RBAC keuangan longgar**: role **gudang** membaca saldo antar-PT (`/interco/accounts`), pelunasan (`/interco/settlements`), dan **laporan margin** (`/interco/margin-report`) → 200 | empiris |

**B. Pengaturan entitas & akun**
| Kode | Masalah | Bukti |
|---|---|---|
| E1 | `PATCH /api/entities/{id}` tak cek keunikan `doc_prefix`/`short_name` | set prefix jadi `KSC` → **200**, dua entitas ber-prefix sama → nomor dokumen bisa kembar |
| E2 | `_ENTITY_CODE_CACHE` (`core_utils.py:69`) tak pernah dibersihkan | ganti prefix tak berlaku sampai backend restart |
| E3 | Entitas **nonaktif** tetap tampil di pemilih; bila dipilih → **diam-diam** jatuh ke entitas home | `X-Entity-Id=<nonaktif>` → `active_entity_id=ent_ksc`; `POST /customers` → `entity_id=ent_ksc` |
| E4 | Mode "Semua Entitas" **menulis diam-diam** ke entitas home | `POST /customers` header `all` → `entity_id=ent_ksc`, tanpa peringatan |
| E5 | Deaktivasi entitas tanpa pagar | entitas dengan user aktif tetap dimatikan; user-nya **tetap bisa login & bekerja**; admin kehilangan entitas itu dari switcher |
| E6 | `DELETE /api/users/{id}` **tidak ada** → tombol "Deactivate" di tab Users = **405** | terbukti |
| E7 | `PATCH /api/users` mengizinkan **email duplikat** | 2 akun ber-email `admin@kainnusantara.id` |
| E8 | Turun jabatan tak mencabut akses | admin→sales: `allowed_entity_ids` tetap semua entitas, `can_switch_entity=true` |
| E9 | Tak ada formulir **ubah** entitas & akun; tombol "Update" hanya PATCH status ke nilai sama tapi bilang "berhasil diupdate" | `AdminView.jsx:381` |
| E10 | Hasil `provisioning` dibuang; notifikasi "entities dibuat: **undefined**" | `useAppActions.js:401` membaca `data.name`, entitas hanya punya `legal_name` |
| E11 | Field entitas yang didukung backend tak ada di UI | `currency`, `fiscal_year_start`, `parent_entity_id`, `is_group`, `coa_template`, `incentive_payer`, `numbering_scheme` |
| E12 | Bentuk data tak konsisten: `/api/entities` mentah (`legal_name`) vs `/auth/context` ringkasan (`name`,`code`) | melahirkan tambalan `utils/entityLabel.js` + komentar bug di ≥6 berkas |
| E13 | `GET /users` abaikan `?entity_id`, batas 100, tanpa paging/filter/penanda entitas di baris | terbukti |
| E14 | Jenis entitas hanya `PT|CV` | `schemas.BusinessEntityCreate.type`; pemilik butuh **perorangan/UD/koperasi/yayasan** |
| E15 | Membuat akun **tidak** tertaut HR; employee HR dibuat otomatis oleh bootstrap dan **jadi yatim** saat user dihapus | 3 employee sisa dari akun probe yang sudah dihapus |

**C. Master data & konfigurasi yang masih bersama padahal harus per entitas**
| Objek | Kondisi | Bukti |
|---|---|---|
| Template dokumen / kop surat (`document_templates`) | `entity_id: null`, header hard-code "KAIN NUSANTARA" | 2 template dipakai kedua entitas |
| Branding PDF | **sudah per entitas** (`GET/PUT /api/pdf/branding/{entity_id}`) | tetapi tata letak `/api/pdf/templates/{doc_type}` masih global |
| Tarif insentif (`incentive_rates`) | 11 baris semua `entity_id="all"` | insentif = beban entitas masing-masing |
| Aturan persetujuan (`approval_rules`) | 9 baris semua `entity_id="all"` | limit approval bisa beda |
| Syarat pembayaran (`payment_terms`), kategori biaya (`expense_categories`), kebijakan retur (`sales_return_policies`) | SHARED | harus per entitas |
| Gudang (`warehouses`) | **tidak punya field entitas sama sekali** | perlu model kepemilikan (bersama vs khusus) |
| Bagan akun (`gl_accounts`) | shared by-code, `entity_id=null` | perlu **aktivasi/akun tambahan per entitas** (kode tetap bersama agar jurnal lama valid) |
| Pusat Pengaturan | 200 entri: 153 mendukung scope `entity`, **47 hanya `global`** | seluruh `hr.*` (BPJS/PPh21/lembur/PTKP), `uom.*`, `lot.*`, `receiving.*`, `makloon.*`, `ui.*`, `role_home.*` |
| Harga per entitas (`entity_prices`) | mesin ADA (`routers/pricelist.py`) tapi **0 baris** | semua entitas pakai `products.price` |

**D. Nomor dokumen**
- `core_utils.next_doc_number()` punya 2 mode: per-entitas (`KSC/PO-00012`) & grup (`PO-00012`).
  35 titik memakai per-entitas; **`warehouse_transfers` (TRF) masih mode grup**.
- Data demo memakai seri grup: `SO-0001…SO-0009`, `PO-00004…PO-00011` dipakai bercampur dua entitas
  (`PO-00005`=Kanda, `PO-00007`=KSC) → nomor tidak bisa membedakan entitas.
- Keputusan pemilik: **hapus dokumen demo lama, seed ulang dengan prefix**.

**E. Visibilitas stok (perlu perubahan perilaku sesuai keputusan #1)**
- `GET /api/inventory/status-board` mengirim `by_entity[]` lengkap **sampai rincian per gudang**
  ke semua role; respons sales KSC = sales Kanda (BTK-MEGA-001: KSC 933 unit/3 gudang, Kanda 7 unit)
  + `has_intercompany_opportunity: true`.
- `GET /api/pegging/rolls` menyertakan roll milik entitas lain (A lihat 1 roll Kanda, B lihat 3 roll KSC).

---

## 2) PRINSIP EKSEKUSI (wajib dipatuhi agen berikutnya)

> **LANGKAH PERTAMA SETIAP SESI BARU (wajib):** `frontend/build/` **hilang setiap pod
> restart** (folder di-gitignore & tidak ikut snapshot) sehingga preview jadi **503**.
> Jalankan `bash /app/scripts/rebuild_frontend.sh` (±40 detik) sebelum apa pun.
> Bila DB kosong: `python /app/seed_realistic.py` (wajib untuk uji dua-entitas — hanya
> seeder ini yang membuat `sales3@kainnusantara.id`, sales entitas `ent_kanda`).

1. **Satu sumber kebenaran**: semua penyaringan entitas lewat `entity_scope.py`. Dilarang menulis
   filter `entity_id` ad-hoc di router baru.
2. **Server penjaga terakhir**: UI boleh menuntun, tetapi penolakan wajib ada di server (403/404).
3. **Gagal berisik, bukan diam-diam**: konteks entitas tidak valid/nonaktif → **tolak dengan pesan**,
   jangan fallback diam-diam ke entitas home (akar E3/E4).
4. **Bahasa Indonesia** untuk seluruh UI & pesan galat (dijaga `scripts/audit_i18n_id.py`).
5. Setiap fase: **POC terisolasi → hijau 100% → BE+FE → `bash scripts/rebuild_frontend.sh` →
   `bash scripts/gate.sh` → `testing_agent_v3` → update `plan.md` + `SESSION_HANDOFF.md` +
   `ENTITY_REGISTRY.md` + `CODEBASE_MAP.md`**.
6. **POC wajib self-cleanup** (aturan `INV-GATE-01` di `scripts/gate_residue.py`).
7. Frontend TIDAK hot-reload (dilayani dari `frontend/build` oleh `static_server.js`) →
   **wajib** `bash /app/scripts/rebuild_frontend.sh` setelah mengubah `frontend/src`.
8. Setiap elemen interaktif baru wajib `data-testid`.
9. Jangan sentuh `backend/.env` & `frontend/.env`.

---

## 3) FASE EKSEKUSI

### FASE E-0 — TUTUP KEBOCORAN + PAGAR ANTI-REGRESI  *(prioritas tertinggi)*
**Tujuan:** klaim "karyawan 1 entitas tidak bisa melihat entitas lain" menjadi benar 100%.

Tugas backend:
- E0.1 `routers/notifications.py` — scope per entitas (`resolve_list_scope("notifications", …)`).
  Pindahkan `notifications` dari SHARED → SCOPED di `entity_scope.py`; tambahkan migrasi
  backfill `entity_id` untuk 9 notifikasi yang kosong.
- E0.2 `payment_plans`, `payment_variance`, `penalties` (cari router pemilik `/api/penalties`),
  `sales-targets`, `sales-incentives` (router CRM/incentive) — pasang `entity_ctx` +
  `resolve_list_scope` pada LIST dan `assert_entity_access` pada DETAIL/aksi.
- E0.3 `routers/audit.py` — ganti gerbang jadi `require_permission(request, "audit", "view")`
  (tambahkan resource `audit` ke `permissions_config.py`: admin `["view"]` saja) **dan** filter
  `entity_id` = entitas aktif. Tambahkan `entity_id` ke penulisan `audit()` di `dependencies.py`
  (sekarang 55 dari 62 baris tidak punya entitas → wajib di-stempel dari konteks).
- E0.4 `routers/lots.py` — `assert_entity_access` di semua endpoint by-id (lot detail, label, silsilah).
- E0.5 `routers/ar_aging.py` + `services/ar_aging_service.py` — resolusi entitas dari `entity_ctx`
  (param `entity_id` opsional; `all` hanya untuk admin/manager); kembalikan `entity_id` yang
  BENAR di respons; laporan wajib menyebut nama entitas.
- E0.6 `routers/settings.py:29` — `get_effective_settings` memakai `entity_ctx` bila param kosong.
  Audit semua pemanggil `get_effective_settings(None)` di service lain (grep) dan perbaiki.
- E0.7 Pembersihan data yatim: skrip `scripts/fix_orphan_entity_refs.py` — laporkan & rapikan
  dokumen ber-`entity_id` yang entitasnya tidak ada (mulai `hr_org_units` 12 baris).
- E0.8 `seed_realistic.py` — perbaiki stempel entitas `sales_targets`/`sales_incentives`
  (ikut `home_entity_id` sales), dan pastikan setiap dokumen demo ber-entitas benar.
- **E0.8b** `routers/transfers.py` (L13/L14) — pasang `entity_ctx` + `resolve_list_scope`
  pada LIST dan `assert_entity_access` pada detail/approve/reject/status/delete.
  Transfer **antar-entitas** perlu aturan khusus: terlihat oleh **kedua** entitas
  (`$or: [source_entity_id, dest_entity_id] ∈ allowed`) tetapi hanya **entitas asal**
  yang boleh menyetujui pengiriman dan **entitas tujuan** yang boleh menerima.
  Daftarkan `warehouse_transfers` ke `SCOPED_COLLECTIONS` + backfill `entity_id`.
- **E0.8c** `routers/documents.py` (L18/L19) — `documents/preview/{order_id}`,
  `documents/generate`, `documents/trace*`, `documents/refs*`, `documents/relations*`
  wajib memverifikasi entitas dokumen sumber (`assert_entity_access`). Cetak dokumen PT
  lain harus **404**.
- **E0.8d** Router sisa hasil pemindaian statik (L17): `admin.py`, `incentive_rates.py`,
  `landed_cost.py`, `payment_variance.py`, `pegging.py` (TANPA scoping) dan `crm.py`,
  `cycle_count.py`, `products.py`, `return_policies.py` (PARSIAL).
- **E0.8e** Registry (L15/L16) — daftarkan 18 koleksi ber-`entity_id` yang belum terdaftar
  sebagai SCOPED atau SHARED **secara eksplisit** (keputusan per koleksi, jangan diam-diam),
  dan perbaiki drift nama `input_tax_invoices` → **`tax_invoices_in`**.
- **E0.8f** RBAC keuangan (L20) — `permissions_config.py`: role **gudang** hanya
  `interco: [view, ship, receive]`; **cabut** akses ke `/interco/accounts`,
  `/interco/settlements`, `/interco/margin-report`, `/interco/reminders`.
- **E0.8g** **(L21 — KRITIS)** `routers/sales_orders_extra.py`: `preview-allocation`
  (baris 48-56) & `preview-lots` (baris 83-90) **mengabaikan `entity_ctx`** dan jatuh ke
  `DEFAULT_ENTITY_ID` → sales CV Kanda mendapat pratinjau ATP **milik KSC**
  (`own_available: 788`, lot `LOT-001`) dan boleh **memaksa** `entity_id=ent_ksc` (200).
  Perbaiki: entitas WAJIB dari `entity_ctx`; `payload.entity_id` divalidasi ∈ allowed;
  `preview-roll-reconcile` flag `all_entities` hanya untuk peran lintas-entitas
  (sekarang membocorkan nomor roll & kode lot PT lain: `RL-632A10`, `KSC/LOT-2608-0026`).
  **Dampak bisnis:** sales menjanjikan stok yang bukan milik entitasnya.

Pagar anti-regresi (WAJIB, ini yang mencegah masalah balik lagi):
- E0.9 Jadikan `scripts/entity_audit/audit_entity_isolation.py` sebagai gate resmi
  `scripts/audit_entity_isolation.py`: sapu SELURUH endpoint GET sebagai sales 2 entitas →
  **FAIL bila ada satu pun `ent_*` asing** (kecuali daftar putih lintas-entitas by design).
  Tambahkan ke `scripts/gate.sh`.
- E0.10 Gate statik: setiap koleksi di `SCOPED_COLLECTIONS` wajib punya router yang memakai
  `resolve_list_scope`/`apply_entity_scope`; laporkan router yang menyentuh koleksi ter-scope
  tanpa lapisan scoping (perluas `scripts/audit_collection_drift.py`).
- E0.11 Perluas `backend/test_f0c_scoping_leak_poc.py` dengan 12 kasus L1–L12 (bukti-merah:
  fixture di kedua entitas dulu, baru buktikan tidak terlihat).

**Kriteria selesai:** sapuan isolasi **0 kebocoran**; POC F0-C hijau (≥40 assert);
`gate.sh` hijau; sales/gudang **403** di `/api/audit-logs`.

---

### FASE E-1 — MODEL ENTITAS: JENIS BADAN USAHA, PAGAR SIKLUS HIDUP, NOMOR DOKUMEN
- E1.1 **Jenis entitas**: enum `PT | CV | Perorangan | UD | Koperasi | Yayasan | Lainnya`
  (daftarkan di `domain_registry.py` supaya bisa dipakai FE lewat `/api/enums`).
  Aturan: NPWP wajib hanya bila PKP; nama legal untuk perorangan = nama pemilik + label usaha;
  `default_tax_mode` **independen** dari jenis.
- E1.2 **Validasi & keunikan**: `PATCH /api/entities` memvalidasi `short_name` & `doc_prefix`
  unik (case-insensitive) — pindahkan validasi ke `entity_provisioning_service` agar satu jalur.
- E1.3 **Kunci prefix**: `doc_prefix` tidak boleh diubah bila entitas sudah menerbitkan dokumen
  (cek `number_sequences` / dokumen ber-entitas). Pesan: sebutkan dokumen pertama yang terbit.
- E1.4 **Cache**: `core_utils._ENTITY_CODE_CACHE` — invalidasi saat entitas dibuat/diubah
  (fungsi `invalidate_entity_code(entity_id)`); dipanggil dari router entities.
- E1.5 **Status entitas**: `GET /api/entities?status=` (default aktif saja untuk pemilih);
  `entity_ctx` **menolak** `X-Entity-Id` entitas nonaktif/tak diizinkan dengan **403 + pesan**
  (hentikan fallback diam-diam). `entity_summaries` hanya entitas aktif.
- E1.6 **Pagar deaktivasi** (`DELETE /api/entities/{id}`): hitung dampak (user aktif, dokumen
  terbuka, saldo, periode belum tutup) → **409 dengan rincian** bila masih terpakai; bila
  dipaksa (peran admin + alasan) → status `archived`: **kunci-tulis** (semua POST/PATCH ke
  entitas itu 409), data lama tetap terbaca oleh admin, pengguna yang home-nya entitas itu
  **diblokir masuk** dengan pesan jelas. Tambah `POST /api/entities/{id}/reactivate`.
- E1.7 **Nomor dokumen seragam**: semua pemanggil `next_doc_number` memakai mode per-entitas
  (termasuk `routers/transfers.py:121,200`). Tambah uji tabrakan: 2 entitas, 50 dokumen paralel
  → nol duplikat. Hapus dokumen demo lama ber-nomor grup; `seed_realistic.py` menerbitkan
  nomor ber-prefix (`KSC/SO-00001`, `KANDA/SO-00001`).
- E1.8 **Bentuk data entitas seragam**: `/api/entities` mengembalikan bentuk yang SAMA dengan
  `/auth/context` (`id, code, name, short_name, legal_name, type, is_pkp, currency, status,
  doc_prefix, logo_url, readiness`). Pensiunkan tambalan `utils/entityLabel.js` (biarkan
  re-export supaya impor lama tidak patah).
- E1.9 **Kesiapan entitas** (`GET /api/entities/{id}/readiness`): daftar periksa terhitung —
  pengguna, gudang yang boleh dipakai, rekening bank, harga jual, saldo awal, kop surat/branding,
  konfigurasi pajak, tahun fiskal. Dipakai UI Fase E-3.

---

### FASE E-2 — AKUN TERTAUT ENTITAS (via HR) & PENEGAKAN AKSES
- E2.1 **Sumber kebenaran entitas karyawan = HR.** `POST/PATCH /api/users` menerima
  `employee_id` (opsional saat migrasi): bila terisi → `home_entity_id` **diambil** dari
  `hr_employees.entity_id` dan tidak bisa berbeda. Bila akun dibuat tanpa employee, sediakan
  aksi "tautkan ke karyawan" + tampilkan peringatan di UI.
- E2.2 `allowed_entity_ids`: untuk role non-lintas (sales/gudang) hanya boleh berisi entitas
  yang **diizinkan pemilik** (home + penugasan tambahan eksplisit). **Ubah role → hitung ulang**
  daftar entitas (tutup E8) dan **cabut sesi** user tersebut.
- E2.3 `PATCH /api/users`: cek **email unik** (409), larang menonaktifkan admin terakhir,
  hapus sesi saat status→inactive / entitas dicabut / password diganti.
- E2.4 `DELETE /api/users/{id}` = **nonaktifkan** (soft) + `POST /api/users/{id}/reactivate`
  + `POST /api/users/{id}/reset-password` (audit, tanpa membocorkan password lama).
- E2.5 `GET /api/users`: filter `entity_id`, `role`, `status`, `q`, **paging** (pakai
  `pagination.py` yang sudah ada), setiap baris membawa `home_entity`, `allowed_entities`,
  `employee_id`, `last_login_at`.
- E2.6 **Rapikan sinkronisasi HR↔akun** di `bootstrap.py:833` — jangan membuat employee untuk
  akun yang sudah tidak ada; sediakan `scripts/fix_orphan_employees.py`.
- E2.7 Audit: setiap perubahan penugasan entitas/role/status tercatat dengan `entity_id`.

---

### FASE E-3 — LAYAR "ENTITAS & AKSES" (UI baru, skala puluhan entitas)
> Ganti tab `Entities`/`Users` di `AdminView.jsx` (tab lama **dihapus** agar tidak ada dua pintu).
> Lokasi: hub `settings-hub` → tab baru **"Entitas & Akses"** (`config/hubTabs.js`),
> view `entities-access`, komponen `features/settings/entities/`.

Struktur komponen (batas 500 baris/berkas):
- `EntitiesAccessView.jsx` — kerangka + tab: **Entitas** · **Akun & Akses** · **Kesiapan**.
- `EntityList.jsx` — tabel/kartu skalabel: pencarian, filter status & jenis, **paging**,
  kolom: nama legal · jenis · kode dokumen · PKP · mata uang · #pengguna · #gudang ·
  kesiapan (%) · status. Aksi baris: buka detail, nonaktifkan/aktifkan.
- `EntityWizard.jsx` — **4 langkah** (progres jelas, bisa mundur, ringkasan sebelum simpan):
  1. **Identitas** — jenis badan usaha (termasuk perorangan), nama legal, nama singkat,
     alamat/kota, NPWP (opsional), logo.
  2. **Pajak & Keuangan** — PKP/non-PKP (jelaskan akibatnya), mata uang, awal tahun fiskal,
     template CoA, penanggung insentif.
  3. **Penomoran & Dokumen** — kode dokumen (pratinjau langsung `KSC/SO-00001`), skema nomor,
     kop surat/branding (bisa "salin dari entitas lain").
  4. **Akses & Kesiapan** — pilih gudang yang boleh dipakai (bersama/khusus), **buat akun
     pertama (PIC) sekaligus** (opsional, tertaut HR), lalu tampilkan **daftar kesiapan**
     yang bisa diklik ke layar terkait.
  Setelah simpan: tampilkan hasil `provisioning` (prefix, PKP, CoA, config) — **bukan**
  notifikasi "undefined" (perbaiki `useAppActions.adminCreate` agar memakai
  `legal_name || name || code`).
- `EntityDetailDrawer.jsx` — **bisa diubah** (tutup E9): identitas, pajak, penomoran (prefix
  terkunci bila sudah ada dokumen — jelaskan alasannya), branding, gudang, harga, pengguna,
  riwayat perubahan (audit), tombol nonaktifkan dengan **pratinjau dampak**.
- `AccountList.jsx` + `AccountFormDrawer.jsx` — daftar akun dengan **lencana entitas**, filter
  per entitas/role/status, pencarian, paging; formulir: nama, email, telepon, role, **karyawan
  HR (pencarian)**, entitas utama (dari HR, hanya-baca bila tertaut), entitas tambahan
  (multi-pilih dengan penjelasan), status; aksi: reset password, nonaktifkan/aktifkan,
  cabut sesi.
- `EntityReadinessPanel.jsx` — daftar periksa per entitas dari E1.9, setiap baris punya
  tombol ke layar penyelesaiannya.

Pemilih entitas (`components/EntitySwitcher.jsx`):
- hanya entitas **aktif & diizinkan**; tandai **entitas utama (home)**; pencarian bila > 8 entitas;
- mode **"Semua Entitas" = HANYA-BACA**: tampilkan pita peringatan di layar dan **matikan
  tombol simpan/buat** dengan pesan "Pilih satu entitas dulu untuk membuat data" (tutup E4);
- entitas nonaktif/tak diizinkan → pesan galat, bukan fallback diam-diam.

Konsistensi lintas layar:
- Lencana entitas (`EntityBadge`) di **setiap** daftar dokumen & panel detail.
- Judul layar/PageMeta menyebut entitas aktif.
- Empty state menyebut entitas: "Belum ada pesanan untuk **CV Kanda Suka**".

#### STATUS E-3 — **SELESAI** (sesi 2026-08-10, lanjutan)
Bukti: `gate.sh` **SEMUA GATE HIJAU** (30 gate) · `POC FASE E-3` **26/26** (idempotent,
nol residu) · `guard:write_scope` self-test **17/17** · `POC FASE E-0` tetap hijau ·
POC antar-entitas `test_g6b_poc` tetap **15/15**.

Yang ditutup di sesi ini (sisa E-3):
1. **Tab lama benar-benar mati.** `AdminView.jsx` tak lagi menerima prop
   `users`/`entities`; cabang `tab === "users"` / `"entities"` yang menganggur dihapus.
   Rantai ternary yang **jatuh ke daftar pengguna** untuk tab tak dikenal (mis. tab
   "Integrasi AI" menampilkan daftar akun) diganti tabel eksplisit `RECORDS_BY_TAB`.
2. **Dua gate merah warisan sesi sebelumnya diperbaiki** — bukan diakali:
   `AccountFormDrawer.jsx` menampilkan `home_entity_id` teknis sebagai cadangan
   (INV-UI-02) → kini lewat `entityFull()`; label "Login terakhir" (audit_i18n_id)
   → "Terakhir masuk".
3. **Mode "Semua Entitas" = HANYA-LIHAT, ditegakkan di server** — cacat nyata yang
   dibuktikan sesi ini: `POST /api/customers` dengan `X-Entity-Id: all` menjawab
   **200** dan dokumennya mendarat di badan usaha HOME. Sekarang ada
   `backend/entity_write_guard.py` (middleware, **deny-by-default**, tabel rute
   tingkat grup ditulis eksplisit dengan alasan per baris). Aturannya satu kalimat:
   *membuat sesuatu yang baru butuh memilih satu badan usaha; menindak dokumen yang
   sudah ada tetap boleh karena dokumen itu sudah punya badan usahanya.*
   Master **bersama** (produk/satuan/kategori/template/gudang), layar **tingkat grup**
   (badan usaha, akun, konfigurasi), **antar-entitas** (interco), dan **pratinjau**
   tetap boleh — dibuktikan POC.
4. **FE mendukung aturan yang sama, bukan menebak**: pita `ScopeReadOnlyBanner`
   (dengan pilih-cepat badan usaha satu klik), `EntitySwitcher` menandai **⭐ Utama**,
   memberi label **"hanya lihat"** pada mode gabungan, menyaring badan usaha terarsip,
   dan memunculkan **pencarian bila > 8** badan usaha; tombol buat/simpan dimatikan
   (`useEntityScope()`); interseptor `apiClient` menjamin penolakan 409 **selalu**
   terlihat sebagai pesan yang menuntun di layar mana pun.
5. **Konsistensi lintas layar**: breadcrumb menyebut badan usaha aktif
   (`page-scope-label`), empty state memakai `scopeSuffix()`
   ("Belum ada pesanan aktif untuk CV Kanda Suka."), daftar badan usaha menambah
   kolom **mata uang** & **#gudang**.

Catatan untuk fase berikut: pagar tulis ini **sekaligus menutup cacat E4** "mode
Semua Entitas menulis diam-diam ke home". E-4 tinggal mengerjakan bagian
*master data & konfigurasi per entitas* (gudang `sharing_mode`, dst).

---

### FASE E-4 — MASTER DATA & KONFIGURASI PER ENTITAS
- E4.1 **Gudang (keputusan 3c)**: tambah `sharing_mode: "shared" | "dedicated"` +
  `entity_ids: []` pada `warehouses` (+`WarehousePayload`). Aturan: `shared` → boleh dipakai
  semua entitas; `dedicated` → hanya `entity_ids`. Terapkan penyaringan di semua pemilih gudang
  (penerimaan, kirim, transfer, stok, stock opname) dan **tolak di server** bila gudang tidak
  boleh dipakai entitas aktif. Migrasi: 3 gudang demo → `shared`.
- E4.2 **Template dokumen / kop surat**: `document_templates` menjadi SCOPED (`entity_id`),
  dengan warisan: template entitas → template global (label "diwarisi dari global").
  Satukan dengan branding PDF per entitas yang sudah ada (`/api/pdf/branding/{entity_id}`);
  tata letak `/api/pdf/templates/{doc_type}` diberi lapisan override per entitas.
- E4.3 **Per entitas**: `payment_terms`, `expense_categories`, `incentive_rates`,
  `approval_rules`, `sales_return_policies` → SCOPED dengan pola **warisan global→entitas**
  (baris `entity_id="all"` tetap berlaku sebagai bawaan, override per entitas menang).
  UI wajib menampilkan lencana asal (**Global** / **Entitas ini**).
- E4.4 **Bagan akun**: kode tetap bersama (jurnal lama valid), tambah per-entitas
  **aktivasi/nonaktifkan akun** + **akun khusus entitas**. Layar CoA menampilkan kolom
  "dipakai entitas ini".
- E4.5 **Pusat Pengaturan (47 entri global-only)**: tambahkan scope `entity` pada seluruh
  `hr.*` (BPJS/PPh21/PTKP/lembur/tipe kerja), `uom.*`, `lot.*`, `receiving.*`, `makloon.*`.
  `ui.*`/`role_home.*` boleh tetap global (jelaskan di UI: "berlaku untuk seluruh sistem").
  Pastikan `config_resolver` benar-benar membaca lapisan entitas untuk kunci baru
  (`scripts/audit_config_wiring.py` harus 0 temuan).
- E4.6 **UI Pusat Pengaturan anti-menyesatkan**: scope **default = entitas aktif** (bukan
  global); pita "Anda sedang mengubah **CV Kanda Suka**"; setiap kartu menampilkan
  **nilai efektif + asal lapisan** (sudah ada `source_label`, pastikan terisi untuk semua
  kunci) + tombol "Kembalikan ke global"; peringatan saat mengubah nilai global yang dipakai
  banyak entitas (pakai `ImpactPicker` yang sudah ada).
- E4.7 **Harga (keputusan 4a)**: layar Pricelist per entitas — grid produk dengan kolom
  **Harga global**, **Harga entitas ini**, **Harga efektif + lencana asal**
  (`Global` / `Entitas` / `Pelanggan`), tombol override & "hapus override", riwayat,
  impor/ekspor CSV. Seed contoh override untuk demo. Pastikan POS/SO memakai harga efektif
  per entitas (sekarang `entity_prices` kosong sehingga jalur ini belum pernah terbukti).

#### STATUS E-4 (diperbarui sesi 2026-08-11, repo `kauajaabsjasdas/kn`)
| Sub-fase | Status | Bukti |
|---|---|---|
| **E4.1 Gudang bersama/khusus** | **SELESAI** | backend 45/45 (iter 212) · frontend FE-1..FE-5 LULUS (iter 214) · gate `guard:warehouse_scope` hijau |
| **E4.7 Harga per badan usaha** | **SELESAI** | frontend FE-6..FE-9 LULUS (iter 214) · 6 `entity_prices` demo (Kanda 5 + KSC 1, 1 terjadwal) |
| **E4.2 Template dokumen per badan usaha** | **SELESAI** | POC §7: kop surat Kanda dipakai cetak Surat Jalan `so_002`, KSC tidak terpengaruh |
| **E4.3 Master per badan usaha** | **SELESAI** | POC 56/56 · syarat bayar · kategori biaya · kebijakan retur · (insentif & aturan persetujuan sudah sejak E-0) |
| **E4.4 Bagan akun per badan usaha** | **SELESAI** | mesin override per-PT sudah ada (F0-E) + lencana asal (`entity_scope`/`source_label`) + kolom "Dipakai <PT>" satu klik |
| **E4.5 Pusat Pengaturan: 47 entri hanya-global** | **SELESAI** | 41 entri `hr./uom./lot./receiving./makloon.` kini ber-scope `entity`; sisa 6 (`ui.*`, `role_home.*`) memang global & dijelaskan di UI |
| **E4.6 UI Pusat Pengaturan anti-menyesatkan** | **SELESAI** | scope bawaan = badan usaha aktif · pita konteks · lencana "nilai <PT>" / "diwarisi dari Global" · tombol **Kembalikan ke global** (`POST /config/values/clear`) |

**Bukti penutup E-4:** `bash scripts/gate.sh` **34 gate HIJAU** ·
`backend/test_core_e4_master_layers_poc.py` **56/56** (3× berturut-turut, nol residu,
memulihkan data demo) · `scripts/audit_config_wiring.py` **0 temuan** ·
`testing_agent_v3` iterasi **214: frontend 12/12 LULUS**.

**Penutupan uji frontend E-4 (sesi 2026-08-11).** Iterasi 213 gagal 70% dan sebabnya
BUKAN fitur: SPA ini tidak punya alamat per layar, dan agen uji memakai pemilih teks
`'PENJUALAN'` padahal teks sumbernya `'Penjualan'` (huruf besar hanya efek CSS).
Yang dikerjakan: **deep-link universal `?view=<viewId>[&tab=][&entity=]`**
(`hooks/useViewDeepLink.js` + `resolveDeepLinkTarget()`), divalidasi terhadap menu peran
sehingga bukan pintu belakang RBAC, dan alamat disegarkan `replaceState` saat berpindah
layar (layar jadi bisa di-bookmark & dibagikan; tombol "kembali" peramban tidak menumpuk).
Alamat juga menerima **id menu/hub** (mis. `?view=ledger` → tab pertama yang boleh dilihat).
Hasil: **iterasi 214 = 12/12 skenario LULUS (FE-1..FE-11), konsol tanpa error merah.**
Sekalian diperbaiki: Pricelist tidak lagi menampilkan **"Rp 0"** untuk 3 produk tanpa harga
(barang sisa/grey) — sekarang "belum ditetapkan" + lencana "Belum ada harga" + bilah
`pl-noprice-hint`, karena angka nol terbaca seolah harga jual yang sah.

#### YANG DIBANGUN UNTUK MENUTUP E4.2–E4.6 (sesi 2026-08-11)
- **Mesin master berlapis** `backend/services/entity_master_service.py` + router generik
  `backend/routers/entity_masters.py`: satu daftar `MASTERS` (6 master) dengan
  `list_layered` (baris + `entity_scope`/`source_label`/`is_overridden`),
  `effective_rows`/`effective_map`/`resolve_row` (baris badan usaha MENANG, dipakai
  semua dropdown), `create`, `patch`, `override`, `revert`.
  **Aturan yang disengaja**: mengubah baris **Global** dari konteks satu badan usaha
  DITOLAK 409 dengan kalimat menuntun (dulu admin bisa diam-diam mengubah aturan seluruh
  grup); `revert` MENGHAPUS baris override (override "nonaktif" tetap menutupi global);
  di mode "Semua Entitas" baris baru lahir **Global**.
- **Registry & migrasi**: `payment_terms`, `expense_categories`, `document_templates`,
  `sales_return_policies` pindah SHARED → SCOPED + terdaftar di
  `INHERITED_GLOBAL_VALUES` (`["all", "", None]`). Migrasi idempotent
  `scripts/migrate_e4_master_scoped.py` menstempel **16 baris** lama menjadi `all`
  (hitung baris sebelum/sesudah; menolak bila jumlah baris berubah). Seed ikut
  distempel supaya seed ulang tidak menghapus lapisan.
- **Konsumen sadar lapisan**: `sales_orders` (jatuh tempo SO), `contra_bon_service`,
  `alert_service` (jatuh tempo AP per badan usaha), `budget_service` +
  `cash_advance_service` (kategori biaya → akun), `inventory_service._resolve_template`
  (kop surat cetak), `return_policy_service` (kebijakan khusus badan usaha MENANG atas
  global pada tingkat cakupan yang sama).
- **Pusat Pengaturan berlapis (E4.5)**: `config_resolver.entity_overlay()` +
  `get_settings(entity_id)` pada `lot_service`, `uom_rules_service`,
  `receiving_uom_service`, `contract_service`, dan `hr_service.get_hr_settings(entity_id)`
  (payroll `preview_run` & jatah cuti ikut). `config_catalog_ops.G` menjadi
  `("global", "entity")` — jujur, karena mesinnya sudah menghormatinya.
- **"Kembalikan ke global" yang benar (E4.6)**: `config_resolver.clear_layer()` menulis
  baris **NISAN** (`cleared: True`, tetap append-only sesuai INV-CFG-03) dan mencabut
  proyeksi di `system_settings`, lalu `POST /api/config/values/clear`. Ini SENGAJA
  dibedakan dari `/values/reset` yang menulis nilai bawaan KODE — kalau disatukan,
  nilai global yang sudah disesuaikan pemilik akan ikut tertimpa angka bawaan.
- **Layar baru "Master per Badan Usaha"** (`?view=entity-masters`, tab di Pusat
  Pengaturan): 6 kelompok master dalam satu tempat, lencana **Global** /
  **Badan usaha ini**, baris global yang ditimpa diredupkan + keterangan "ditimpa",
  tombol **Buat khusus <PT>** dan **Kembalikan ke global**, form baris baru dengan
  saklar "Jadikan Global".
- **Layar CoA (E4.4)**: kolom **Dipakai <PT>** (satu klik menyala/mati, hanya untuk
  badan usaha itu) + lencana `global`/`override` + catatan lingkup yang menyebut
  bahwa kode akun tetap bersama sehingga jurnal lama tetap sah.

#### RENCANA PENUTUPAN E-4 (sisa: E4.2 · E4.3 · E4.4 · E4.5 · E4.6)
Prinsip yang dipakai ulang (jangan bikin mesin baru): **warisan global → badan usaha**
sudah ada di `entity_scope.INHERITED_GLOBAL_VALUES` + `resolve_list_scope_inherit`
(dipakai `incentive_rates`/`approval_rules` sejak E-0). Sisanya mengikuti pola itu.

- **E4a — mesin master berlapis** `backend/services/entity_master_service.py`: satu daftar
  spesifikasi (`MASTERS`) berisi koleksi, kunci keunikan, label, field yang boleh diubah.
  Menyediakan `list_layered` (baris + `entity_scope`/`source_label`), `effective_rows`
  (baris badan usaha MENANG atas global, dipakai semua dropdown), `create`, `patch`,
  `override` (salin baris global menjadi khusus badan usaha), `revert` (lepas override).
  Router generik `backend/routers/entity_masters.py` supaya 6 master tidak butuh 6 layar.
- **E4b — registry & migrasi**: `payment_terms`, `expense_categories`,
  `sales_return_policies`, `document_templates` menjadi SCOPED + terdaftar sebagai
  "punya baris global sah" (`["all", "", None]`). Migrasi idempotent
  `scripts/migrate_e4_master_scoped.py` menstempel baris lama menjadi `all` (global)
  supaya TIDAK ADA baris yang hilang dari layar.
- **E4c — konsumen ikut sadar lapisan**: daftar syarat pembayaran, kategori biaya,
  template dokumen, kebijakan retur yang dipakai dropdown/laporan memakai `effective_rows`
  (tanpa baris kembar) — termasuk `config_service`, `contra_bon_service`, `alert_service`,
  `budget_service`, `cash_advance_service`, `inventory_service`.
- **E4d — satu layar "Master per Badan Usaha"** (tab baru di Pusat Pengaturan):
  6 kelompok master dalam satu tempat, tiap baris berlencana **Global** / **Badan usaha ini**,
  tombol **"Buat khusus <badan usaha>"** dan **"Kembalikan ke global"**. Mengubah baris
  **Global** saat satu badan usaha aktif DITOLAK dengan kalimat menuntun (bukan diam-diam
  mengubah nilai semua badan usaha).
- **E4e — E4.4 bagan akun**: kode CoA tetap bersama (jurnal lama valid) + aktivasi/nonaktif
  per badan usaha + akun khusus badan usaha; kolom "dipakai badan usaha ini" di layar CoA.
- **E4f — E4.5/E4.6 Pusat Pengaturan**: scope `entity` untuk seluruh `hr.*`, `uom.*`,
  `lot.*`, `receiving.*`, `makloon.*`; scope **bawaan = badan usaha aktif**; tiap kartu
  menampilkan nilai efektif + asal lapisan + tombol "Kembalikan ke global";
  `scripts/audit_config_wiring.py` harus 0 temuan.
- **E4g — POC gabungan** `backend/test_core_e4_master_layers_poc.py` (satu skrip,
  self-cleanup): baris global terlihat dari konteks badan usaha · override badan usaha
  menang · override Kanda TIDAK terlihat oleh KSC · dropdown tidak kembar ·
  ubah baris global dari konteks badan usaha ditolak dengan pesan menuntun ·
  di mode "Semua Entitas" baris baru lahir sebagai global.

---

### FASE E-5 — VISIBILITAS STOK SESUAI KEPUTUSAN #1
- E5.1 `GET /api/inventory/status-board`: untuk role non-lintas → **hanya `by_entity` entitas
  sendiri** + `global_total` (agregat tanpa rincian entitas/gudang). Untuk admin/manager →
  rincian penuh seperti sekarang. Field `has_intercompany_opportunity` tetap boleh muncul
  (sebagai isyarat "tersedia di entitas lain") **tanpa** membocorkan angka per gudang.
- E5.2 `GET /api/pegging/rolls` + turunan: scope ke `owner_entity_id` entitas aktif.
- E5.3 Mutasi pindah-kepemilikan antar-entitas tetap terlihat (jejak wajib), tetapi label
  entitas lawan hanya nama singkat.
- E5.4 **Sudah dibahas & dikunci di FASE E-8** (dahulu diparkir): pembagian akses & UI/UX
  **sales vs admin sales vs finance** — lihat `ANALISIS_DOMAIN_SALES.md` §8.

#### STATUS E-5 — **SELESAI** (sesi 2026-08-11, repo `kikijujahasa/kn`)
| Sub-fase | Status | Bukti |
|---|---|---|
| **E5.1 Papan stok: detail sendiri + agregat grup** | **SELESAI** (sudah sejak E-0, **diverifikasi ulang empiris**) | sales KSC: `by_entity`=[`ent_ksc`] · `total_available` 965 = stok sendiri · `global_total.available` 990 = stok grup · `other_entities_available` 25 · `detail_scope="own_entity"` · `owner_entity_id=<PT lain>` → **403**. Admin: `detail_scope="group"` + rincian per gudang |
| **E5.2 Pegging ter-scope kepemilikan** | **SELESAI** (sudah sejak E-0, diverifikasi ulang) | fixture roll pegging di 2 badan usaha: sales hanya melihat rollnya; admin di konteks PT lain tetap melihatnya |
| **E5.3 Mutasi lintas-PT: lawan = nama singkat** | **SELESAI** (**BARU** sesi ini) | `services/movement_label_service.attach_counterparty_labels()` |
| **E5.3c Kartu Riwayat Produk ter-scope** | **SELESAI** (**kebocoran BARU yang ditemukan & ditutup sesi ini**) | `routers/inventory.product_history` |
| E5.4 | dipindah ke **FASE E-8** | keputusan pemilik sudah lengkap di E8.10/E8.10b |

**Bukti penutup E-5:** `backend/test_core_e5_visibility_poc.py` **52/52** — dan **terbukti bisa
MEMERAH** (scope disabotase sengaja → **7 FAIL**, dipulihkan → 52 PASS) ·
`bash scripts/gate.sh --ci` **HIJAU** dengan gate baru
`POC FASE E-5 (papan stok agregat · pegging · mutasi lintas-PT nama singkat · kartu riwayat)` ·
`testing_agent_v3` iterasi **216: frontend 23/23 LULUS, nol error konsol**.

#### TEMUAN BARU SESI INI (tidak ada di rencana lama) — `GET /api/history/{product_id}`
Verifikasi E5.3 membuka kebocoran yang **belum pernah tercatat**: Kartu Riwayat Produk
mengambil **seluruh** mutasi sebuah produk **tanpa scope entitas sama sekali**
(`{"product_id": product_id}` telanjang). Bukti empiris sebelum perbaikan: sales
PT Kain Suka Cita mengklik satu produk → **9 baris, 2 di antaranya milik CV Kanda Suka**,
lengkap dengan nomor lot `KANDA/LOT-2608-0001` dan nama gudangnya. Ini sekelas **L21**
dan bertentangan langsung dengan Keputusan #1. Sesudah `resolve_list_scope`: **7 baris,
semuanya milik badan usaha sendiri**, jumlahnya TEPAT sama dengan hitungan DB, dan mutasi
pindah-kepemilikan sisi sendiri **tetap tampil** (jejak tidak ikut terhapus).
*Pelajaran yang dipagari:* gate isolasi lama menyapu endpoint **daftar**; endpoint
"riwayat satu induk" seperti ini lolos karena parameternya `product_id`, bukan `entity_id`.
POC E-5 sekarang menjaganya.

#### YANG DIBANGUN UNTUK MENUTUP E5.3 (sesi 2026-08-11)
- **`services/movement_label_service.attach_counterparty_labels()`** — satu tempat untuk
  menamai badan usaha lawan pada mutasi pindah-kepemilikan. Field turunan (data tersimpan
  TIDAK diubah — ledger tetap append-only): `counterparty_entity_name` (**nama singkat**,
  mis. `Kanda`), `counterparty_direction` (`in`/`out`, ditentukan dari `owner_entity_id`
  baris supaya baris masuk & keluar tidak tertukar), `counterparty_label`
  (`"dari Kanda"` / `"ke Kanda"`). Nama diambil `short_name` → `doc_prefix` → kalimat
  netral; **tidak pernah** jatuh kembali ke id teknis.
  **Aturan yang disengaja:** untuk peran **non-lintas**, id teknis
  `from_owner_entity_id`/`to_owner_entity_id` **DICABUT** dari respons dan nama badan
  hukum tidak pernah dikirim (dulu `ent_kanda` dikirim mentah); peran **lintas-entitas**
  tetap menerima id teknis + `from_entity_name`/`to_entity_name` supaya layar admin &
  konsolidasi tidak kehilangan kemampuan.
- **`routers/inventory.py`** — label dipasang di **kedua** jalur `list_movements`
  (biasa & paginasi; layar Mutasi memakai yang paginasi, jadi kalau hanya satu jalur
  dipasang lencananya hilang di layar) dan di `product_history`.
- **Frontend `CounterpartyBadge`** (`features/wms/inventory/inventoryConstants.jsx`) dipakai
  bersama oleh layar **Mutasi** (`LedgerTable.jsx`) dan **Kartu Riwayat Produk**
  (`ProductHistoryPanel.jsx`): lencana biru "↙ dari Kanda" untuk masuk, jingga
  "↗ ke Kanda" untuk keluar, plus tooltip yang menyebut bahwa rincian stok badan usaha
  lawan memang tidak ditampilkan.
- **Kerapian repo**: **124 skrip uji lama** di akar repo (`backend_test_*.py`,
  `test_*_poc.py`, `vendor_bill_*.py`) dipindah ke `tests/archive/` + `README.md` yang
  menjelaskan mana yang masih aktif. Diperiksa lebih dulu: **nol** rujukan dari
  `scripts/`; gate tetap hijau sesudah pemindahan. Akar repo sekarang hanya berisi
  3 skrip seed.

*Catatan kegagalan yang layak dicatat:* dua `search_replace` **paralel pada berkas yang
sama** (`LedgerTable.jsx`) saling menimpa sehingga baris impor `CounterpartyBadge` hilang
→ layar blank dengan `PAGE ERROR: CounterpartyBadge is not defined`. Ditemukan lewat
screenshot + log konsol, bukan lewat gate (gate tidak menjalankan browser). **Edit paralel
hanya boleh untuk berkas yang berbeda.**

---

### FASE E-7 — ANTAR-ENTITAS (lanjutan) · **KEPUTUSAN PEMILIK LENGKAP**
> Verifikasi lengkap: `AUDIT_ANTAR_ENTITAS.md`. Fondasi G-6/G-6b **sudah kuat & terbukti**
> (POC 21/21, INV-IC-01..08 hijau): dokumen kembar, harga dari kontrak internal, PPN &
> faktur pajak internal berpasangan, saldo pasangan PT, netting, jembatan gudang dengan
> pindah kepemilikan roll, retur antar-PT, eliminasi margin otomatis di konsolidasi,
> laporan margin. **Yang perlu diputuskan pemilik sebelum dieksekusi:**

- **E7.1 Permintaan barang antar-PT oleh sales** (IC-G9). Sekarang sales **403** di seluruh
  menu antar-entitas, padahal papan stok memberi isyarat "tersedia di PT lain".
  Opsi: (a) buat **Permintaan Internal** (sales ajukan → admin/manager menjadikan transaksi
  antar-PT, ikut `approval_threshold_rupiah` yang sudah ada) · (b) cukup manual di luar sistem.
- **E7.2 Pagar "lawan transaksi ternyata PT sendiri"** (IC-G10). Tambah penanda entitas grup
  pada `customers`/`suppliers` + **tolak** SO/PO yang lawannya PT grup dengan kalimat
  menuntun ke layar Antar Entitas (mencegah laba grup kembung karena margin tak tereliminasi).
- **E7.3 HPP penjual wajib ada** (IC-G11). `margin-report` melaporkan `cost: 0` →
  `margin 100%`. Putuskan: tolak transaksi bila HPP belum terhitung, atau tandai
  "HPP taksiran" di laporan & eliminasi.
- **E7.4 Kas/rekening tingkat grup** (IC-G12). 13 dari 19 transaksi kas ber-`entity_id="all"`,
  termasuk penerimaan piutang KSC. Putuskan modelnya: (a) hapus kas grup — setiap uang wajib
  milik satu PT · (b) kas grup tetap ada tetapi **otomatis menimbulkan hutang/piutang
  antar-PT** · (c) biarkan (tidak disarankan: keuangan PT jadi tidak utuh).
- **E7.5 Jalur antar-PT yang belum ada** (§C `AUDIT_ANTAR_ENTITAS.md`): titip bayar,
  pinjaman antar-PT, alokasi biaya bersama, makloon/jasa internal, pindah aset tetap,
  penempatan karyawan lintas-PT, eliminasi IC-AR/IC-AP otomatis di neraca konsolidasi.
  Bangun hanya yang benar-benar terjadi di lapangan (menunggu daftar dari pemilik).
- **E7.6 Konsistensi kecil**: `interco_returns` mengembalikan `pair_id`/`qty_total`
  (sekarang null karena bernama `return_pair_id`) · nomor `TRF` ikut ber-prefix entitas
  (sudah tercakup E1.7).
- **E7.7 Keputusan pemilik (2026-08-10) yang sudah PASTI untuk fase ini:**
  - **Entitas lain diperlakukan seperti PEMASOK, bukan pelanggan.** Bila KSC membeli dari
    Kanda, maka Kanda muncul sebagai pemasok bertipe "Entitas grup" dengan logika yang sama
    (wajib kontrak internal dulu, dst). **JANGAN** membuat pelanggan untuk PT sendiri.
    Pembedanya tetap **menu Antar Entitas** (+ lencana di layar pembelian).
  - **Kas/rekening tingkat grup DIHAPUS** (jawaban 3a): setiap uang wajib milik satu entitas.
    Migrasi: 13 transaksi kas ber-`entity_id="all"` + rekening "Kas Besar Grup" harus
    dipetakan ke entitas pemiliknya (penerimaan `KSC/AR-*` → `ent_ksc`, dst) — **butuh
    langkah migrasi ber-laporan, bukan tebakan**; yang tidak bisa dipetakan → jadi kasus
    di Pusat Kasus Keuangan.
  - **HPP taksiran DIBOLEHKAN tapi WAJIB BERLABEL** (jawaban 4b): laporan margin & eliminasi
    menandai `cost_estimated` dengan jelas di UI, bukan angka telanjang.
  - **Jalur antar-PT yang dibangun: hanya (1) pinjaman uang antar-PT dan (2) pindah aset
    tetap antar-PT.** Titip bayar, alokasi biaya bersama, makloon internal, dan penempatan
    karyawan lintas-PT **TIDAK dibangun** (pemilik menyatakan tidak terjadi).

#### KEADAAN AWAL E-7 (diverifikasi empiris sesi 2026-08-11 — sebelum eksekusi)
| Item | Keadaan terbukti |
|---|---|
| E7.1 (IC-G9) | **belum ada**: nol rujukan `internal_request` di seluruh backend |
| E7.2/E7.7 (IC-G10) | **belum ada**: `routers/customers.py`, `routers/suppliers.py`, `schemas.py` **nol** rujukan ke `business_entities`; tidak ada `partner_kind` di supplier |
| E7.3 (IC-G11) | `cost_estimated` **hanya** ada di `services/interco_margin.py` jalur `margin-by-product`; `margin-report` & eliminasi belum berlabel |
| E7.4 (IC-G12) | rekening **"Kas Besar Grup"** (`bank_kas_besar`, `entity_id="all"`) masih ada; **13 dari 19** `cash_transactions` ber-`entity_id="all"`, termasuk `CASH-00013/14/15` "Penerimaan KSC/AR-0000x" (jelas milik KSC) dan `CASH-00016/17/18` pembayaran kontrabon/VB |
| E7.5 | koleksi `interco_loans` **tidak ada**; `fin_fixed_assets` **0 baris** (jadi jalur pindah aset belum pernah bisa dibuktikan — seed perlu ditambah) |
| E7.6 (IC-G13) | `interco_returns` menyimpan `return_pair_id` **tanpa** `pair_id`/`qty_total` |
| E7.6 (IC-G14) | `TRF-00001..3` (`intra_entity`) masih seri grup; yang `inter_entity` sudah ber-prefix (`KSC/TRF-00004`, `KANDA/TRF-00001`) → sisa **data demo lama** + seed |
| IC-G1..IC-G8 | **sudah ditutup di FASE E-0** (tidak diulang di sini) |

#### RENCANA EKSEKUSI E-7 — BERGELOMBANG
Prinsip: **jangan bangun mesin baru** kalau mesin G-6/G-6b sudah ada. Yang ditambah hanya
pagar, label, jalur permintaan, dan dua jalur uang/aset yang pemilik nyatakan memang terjadi.

**GELOMBANG 1 — kebenaran angka & pagar (tanpa butuh keputusan tambahan pemilik)**
- **E7a (E7.2 + E7.7) — "lawan transaksi ternyata PT sendiri".** Tambah
  `partner_kind: "external"|"entity"` + `group_entity_id` pada `suppliers`
  (dan `group_entity_id` pada `customers` **hanya sebagai pagar deteksi** — pelanggan untuk
  PT sendiri tetap TIDAK boleh dibuat). Provisioning entitas menyiapkan baris pemasok
  bertipe **Entitas grup** untuk setiap badan usaha lain. **TOLAK** `POST/PATCH`
  purchase-order/purchase-requisition yang pemasoknya entitas grup dan sales-order yang
  pelanggannya entitas grup, dengan kalimat menuntun ke layar **Antar Entitas**
  (pola `tax_invoice_service.py:195`). Lencana "Entitas grup" di layar pemasok & pembelian.
- **E7b (E7.6) — konsistensi kecil.** `interco_returns` ikut mengirim `pair_id`
  (alias `return_pair_id`) + `qty_total`; nomor `TRF` `intra_entity` ber-prefix entitas
  (perbaiki `next_doc_number` bila perlu + seed).
- **E7c (E7.3) — HPP taksiran WAJIB BERLABEL.** `margin-report` + eliminasi konsolidasi
  membawa `cost_estimated` (+ alasan taksiran); UI menandainya, **bukan angka telanjang**.

**GELOMBANG 2 — jalur yang hilang untuk sales (E7.1)**
- **E7d — Permintaan Internal** (`internal_requests`, SCOPED, nomor `<ENT>/PIN-#####`):
  sales mengajukan "minta barang dari PT lain" langsung dari isyarat papan stok →
  masuk antrean admin/manajer → **dijadikan transaksi Antar-PT** yang bertaut
  (`source_request_id` + relasi dua arah `doc_refs_service`). Ambang
  `antar_entitas.approval_threshold_rupiah` yang sudah ada tetap dihormati.
  Di **FASE E-8** antrean ini pindah ke Meja Admin Sales (E8.8) — mesinnya jangan diulang.

**GELOMBANG 3 — uang & aset (E7.4 + E7.5) · E7.4 BUTUH KONFIRMASI PEMILIK PER BARIS**
- **E7e (E7.4) — kas grup DIHAPUS.** `scripts/migrate_e7_group_cash.py` dua tahap:
  `--report` (usulan pemetaan + **bukti per baris**, tanpa menulis) lalu `--apply`.
  Baris yang tidak bisa dipetakan → **kasus** di Pusat Kasus Keuangan. Sesudah migrasi:
  pagar menolak pembuatan rekening/transaksi kas ber-`entity_id="all"`.
- **E7f (E7.5-1) — pinjaman uang antar-PT** (dokumen kembar: piutang pemberi ↔ hutang
  penerima, masuk `interco_accounts` supaya ikut netting & pengingat).
- **E7g (E7.5-2) — pindah aset tetap antar-PT** (nilai buku + akumulasi penyusutan ikut,
  eliminasi laba pindah). Seed perlu contoh aset tetap karena sekarang 0 baris.

**PENUTUP E-7**
- **E7h — POC gabungan** `backend/test_core_e7_interco_poc.py` (satu berkas, self-cleanup,
  bukti-merah) + daftarkan di `scripts/gate.sh` + frontend untuk seluruh jalur di atas +
  `testing_agent_v3`.

#### STATUS E-7 — **SELESAI** (sesi 2026-08-11 penutup, repo `ganakauaanabasa/KN`)
| Sub-fase | Status | Bukti |
|---|---|---|
| **E7a Pagar "lawan transaksi ternyata PT sendiri"** | **SELESAI** | `suppliers.partner_kind="entity"` + `group_entity_id`; provisioning membuat baris pemasok Entitas grup otomatis (seed: 2 dibuat); PO/PR ke entitas grup **DITOLAK** dengan kalimat menuntun; UI: pita `group-entity-notice` + tombol simpan mati + lencana "Entitas grup" di layar pemasok |
| **E7b Konsistensi kecil** | **SELESAI** | `interco_returns` mengirim `pair_id` + `qty_total`; `TRF` intra-entity ber-prefix badan usaha |
| **E7c HPP taksiran WAJIB berlabel** | **SELESAI** | `margin-report` membawa `cost_estimated` + alasan; UI: pita `interco-margin-estimated-warning` + sel `≈` "HPP taksiran (WAC)" — tidak ada lagi margin 100% telanjang |
| **E7d Permintaan Internal (PIN)** | **SELESAI** | `internal_requests` ter-scope, nomor `<ENT>/PIN-#####`; sales mengajukan dari papan stok, **sales DILARANG memilih sumber** (400 di API, panel `pin-sources` disembunyikan di UI); admin memilih kandidat → jadi transaksi antar-PT kembar + tautan dua arah G-4 |
| **E7e Kas tingkat grup DIHAPUS** | **SELESAI** | rekening & transaksi kas ber-`entity_id="all"` ditolak 409; data demo bersih (0 sisa); ringkasan kas melaporkan sisa secara jujur |
| **E7f Pinjaman uang antar-PT** | **SELESAI** | dokumen kembar `KSC/ICL-0000x ⇄ KANDA/ICL-0000x`; draf → **Cairkan** → saldo non-dagang naik → **Angsuran** → `Lunas`; angsuran > sisa ditolak |
| **E7g Pindah aset tetap antar-PT** | **SELESAI** | `KSC/FA-00001 → KANDA/FA-00003` (nilai buku + **masa manfaat SISA** ikut); utang antar-PT terbentuk; **Catat pembayaran** memindahkan uang di dua buku (`KANDA/CASH-00015 · KSC/CASH-00034`); pindah dua kali ditolak |
| **E7g-2 CACAT BARU (ditemukan lewat layar, ditutup sesi ini)** | **SELESAI** | ringkasan aset dulu menghitung aset yang **sudah pindah** sebagai milik sendiri (mengaku punya Rp 420 jt yang sudah bukan haknya) & pil status merender hijau **"Aktif"**. Kini `summary()` mengeluarkan `transferred`, menambah `transferred`/`transferred_book_value`/`transferred_unsettled`, pil status = **"Pindah PT"** (biru), KPI baru "Pindah ke PT Lain" |
| **E7h POC + verifikasi layar** | **SELESAI** | POC `backend/test_core_e7_interco_poc.py` **56/56** (naik dari 53 — 3 pemeriksaan baru untuk E7g-2) · `gate.sh --ci` **HIJAU (49 gate)** · `testing_agent_v3` iterasi **219: 8/10 user story LULUS, nol error konsol**; **US6 (pinjaman) & US8 (pindah aset) diverifikasi tangan oleh agen utama** karena agen uji hanya menguji separuh |

**Perbaikan sampingan sesi penutup:** layar `internal-requests` tidak punya entri `PAGE_META`
sehingga kepala halaman jatuh ke judul cadangan "Kain Nusantara"/kicker "Workspace" —
diperbaiki **dan** dipagari gate baru `check_nav_map.py` **CHECK 5** (setiap layar wajib
punya judul & kicker; 94 layar diperiksa).

**Jebakan yang mahal (BACA sebelum memanggil agen uji):** iterasi **218 melaporkan
"navigasi rusak, session reset" dan 0% pada 9 user story — itu LAPORAN PALSU.** Sebabnya
dua: (a) agen mengeklik `text=GUDANG` padahal wrapper `nav-group-*` bukan elemen klik
(yang bisa diklik `nav-group-toggle-*`), (b) skrip memakai sintaks Playwright **sync**
di lingkungan **async** sehingga `locator.count()` mengembalikan coroutine dan disimpulkan
sebagai layar kosong. **Resep yang benar: deep-link `?view=<viewId>&entity=<entityId>`**
(`hooks/useViewDeepLink.js`) — buka URL, login, aplikasi langsung mendarat di layar itu
dengan badan usaha terpilih; sesi bertahan antar `page.goto`. Iterasi 219 memakai resep ini
dan langsung 100% pada bagian yang diujinya.


### FASE E-8 — DOMAIN SALES · ADMIN SALES · FINANCE · **KEPUTUSAN PEMILIK LENGKAP**
> Analisis lengkap + bukti + usulan matriks izin & UI: **`ANALISIS_DOMAIN_SALES.md`**.
> Inti temuan: sistem hanya punya **4 peran** (admin/sales/manager/warehouse) — **tidak ada
> "admin sales"**, sehingga orang itu harus dijadikan `sales` (tak bisa Konfirmasi SO) atau
> `manager` (ikut dapat kuasa tutup buku, payroll, bayar tagihan supplier, hapus master).

- **E8.1** Tambah peran **`sales_admin`** dan **`finance`** + **registry peran**
  (`backend/role_registry.py`, `frontend/src/config/roles.js`) sebagai sumber tunggal:
  label, peringkat, beranda, lintas-entitas. Arahkan `role_satisfies` (peringkat hard-code)
  & ~63 literal BE / ~81 literal FE ke registry secara bertahap (yang menentukan wewenang
  lebih dulu). **6 peran** total: admin · manager · sales_admin · finance · sales · warehouse.
- **E8.2 Pemisahan tugas (SD2)**: **cabut** dari peran `sales` → `tax_invoice.create/print`,
  `ar_receipt.create`, `payment_variance.decide`, `payment_plan.create/update`, pegging/earmark;
  **uang masuk & faktur pajak → peran `finance`**, alur SO & pemenuhan → `sales_admin`.
  (Ini pertanyaan lama **G5** di `ROLE_UX_GAP_AUDIT.md` yang kini SUDAH diputuskan pemilik.)
- **E8.3 Tutup layar mati untuk sales**: menu "Operasi WMS" terlihat tetapi `/api/wms/tasks`
  **403** (SD3) → beri `wms.view` ringkas atau endpoint "status pengiriman pesanan saya";
  menu "Kunjungan Sales" **403** (SD4) → izin melihat kunjungannya sendiri.
- **E8.4 Kepemilikan data sales (SD5/SD8)**: daftar SO **default "Pesanan Saya"** (sekarang
  `sales2@` melihat 8 SO milik rekannya, nol miliknya); `reports/top-customers` ikut filter pemilik.
- **E8.5 Target/insentif (SD6/SD7)**: ter-scope entitas + perbaiki stempel `entity_id`
  (Citra, sales Kanda, ter-stempel `ent_ksc`); `/api/sales-users` ikut entitas.
- **E8.6 `mark-delivered` (SD9)**: dicabut dari `sales`; **boleh gudang MAUPUN Admin Sales**
  (keputusan pemilik 3).
- **E8.7 Meja Admin Sales berbasis ANTREAN** (9 antrean — lihat §5.2 analisis):
  layar baru `features/sales_admin/`, bukan sekadar menu tambahan.
- **E8.8 Permintaan internal dari sales (SD10)**: tombol "Minta dari PT lain" pada isyarat
  stok → masuk antrean Admin Sales → menjadi transaksi Antar Entitas
  (keputusan pemilik: **admin sales yang mengeklik**).
- **E8.9 Entitas grup sebagai PEMASOK** — sejalan E7.7 & pagar E7.2.
- **E8.10 Definisi domain dari pemilik (2026-08-10) — MENGIKAT:**
  - **Sales (lapangan)**: jual barang · basis pelanggan sendiri · buat SO · **lihat status
    lifecycle pesanan** · **hanya SO miliknya** · **mengajukan retur**. Tidak mengurus
    operasional/manajemen.
  - **Admin Sales**: mengelola **keseluruhan SO** — **validasi** → **keputusan pemenuhan**
    (stok sendiri · **ambil dari PT lain** · **reorder ke supplier**) → konfirmasi →
    dokumen → **memproses retur** yang diajukan sales.

- **E8.10b KEPUTUSAN PEMILIK atas 4 pertanyaan penutup (MENGIKAT):**
  1. **Admin Sales = berbasis penugasan**: bisa dikunci 1 entitas atau diberi beberapa
     entitas. → JANGAN masukkan `sales_admin` ke `CROSS_ENTITY_ROLES`; pakai
     `allowed_entity_ids` tersimpan (mekanisme yang sudah ada untuk peran non-lintas),
     dan UI penugasan entitas di E-3 harus mendukung multi-pilih untuk peran ini.
  2. **Kasir/Finance DIPISAH** → **dua peran baru sekaligus**: `sales_admin` **dan**
     `finance`. Yang **mencatat uang masuk (kwitansi AR)** dan **menerbitkan Faktur Pajak**
     adalah **`finance`**, bukan Admin Sales dan bukan sales.
  3. **`mark-delivered` boleh gudang MAUPUN Admin Sales** (dua-duanya), dicabut dari `sales`.
  4. **Admin Sales berkuasa penuh atas keputusan pemenuhan**: buat PR (reorder supplier),
     **ambil dari PT lain**, dan pegging — **tanpa** persetujuan manajer. Kunci config
     `antar_entitas.approval_threshold_rupiah` **tetap disediakan** (default: tidak
     mengunci Admin Sales) supaya pemilik bisa menyalakannya kapan pun tanpa deploy.

- **E8.1b Matriks izin dua peran baru (rancangan awal — kunci saat eksekusi):**
```
sales_admin  (Admin Sales — pemilik alur SO end-to-end, TANPA menyentuh uang & pajak)
  order:            view, create, update, confirm, print          (approve → manager)
  customer:         view, create, update
  document:         view, create, print
  sales_return:     view, create, update                          (approve → manager)
  price_approval:   view, create, update                          (approve → manager)
  purchase_requisition: view, create, update                      (approve → manager)
  interco:          view, create, update, invoice                 (settle/cancel → manager)
  transfer:         view, create                                  (approve → manager/gudang)
  inventory:        view                (+ pegging/earmark: dipindah dari sales)
  wms:              view                (pantau progres, tanpa aksi)
  special_order:    view, create, update
  pricelist/product/uom/warehouse/template: view
  finance_case:     view, create
  esign/document_delivery: view, sign/send
  payment_plan:     view, create, update    (usul; pembebasan/void → manager)
  penalty:          view
  reports:          view                (tanpa kolom biaya/HPP)
  TIDAK punya: tax_invoice.create · ar_receipt.create · payment_variance.decide

finance  (Kasir/Finance — sisi UANG MASUK & PAJAK KELUARAN)
  ar_receipt:       view, create                                  (void → manager)
  tax_invoice:      view, create, replace, print                  (cancel → manager)
  payment_variance: view, decide        (batas nominal tetap dijaga config payment.variance_*)
  penalty:          view, issue                                   (waive/adjust → manager)
  payment_plan:     view, update
  cash:             view, create
  accounting:       view
  order:            view, print          (tanpa create/update/confirm)
  customer:         view
  sales_return:     view
  finance_case:     view, create
  reports:          view
  document:         view, print
  CATATAN: sisi HUTANG (vendor_bill.pay, contra_bon, landed_cost) TETAP manager/admin
  sampai pemilik memutuskan sebaliknya — jangan diperluas sendiri.
```
  Dicabut dari `sales`: `tax_invoice.*` · `ar_receipt.create` · `payment_variance.decide` ·
  `payment_plan.create/update` · `order.update` untuk `mark-delivered` · pegging/earmark.
  Ditambah ke `sales`: melihat perjalanan pesanan & kunjungan sendiri (E8.3/E8.14).
  **Hirarki `role_satisfies`**: `sales:1 · warehouse:1 · sales_admin:2 · finance:2 ·
  manager:3 · admin:4` (pindahkan ke registry peran, jangan angka ajaib).

- **E8.11 Mesin pemenuhan yang SUDAH ADA (jangan dibangun ulang!)**:
  `POST /sales-orders/preview-allocation` (klasifikasi `from_stock/from_incoming/
  inter_company/backorder` + `cross_entity[]` + kalimat penjelas) · `GET /stock/pending-so`
  (papan pending + coverage + promise date) · `POST /sales-orders/{id}/repeat-restock`
  (SO→PR, jejak dua arah `source="so_repeat"`, notifikasi MD) · `GET /{id}/restock-state`
  (kandidat + `open_pr_number`) · `GET /stock/atp` · pegging `earmark` ·
  `backorder_service.auto_fulfill_backorders` · mesin Antar Entitas G-6.
  **Tugas E-8 = menyatukan semuanya di satu Meja Admin Sales + memberi peran & izin**,
  bukan menulis mesin baru.
- **E8.12 Tautan SO ↔ Antar Entitas (A8)**: tambah `source_order_id`/`demand_ref` pada
  `interco_transactions` (meniru `source_ref_id` pada PR) + jejak dua arah G-4 supaya
  "ambil dari PT lain untuk `SO-0009`" terlacak.
- **E8.13 Pisahkan verifikasi administratif dari persetujuan manajerial (A7)**: persetujuan
  `nilai` sekarang memaksa role manajer bahkan untuk validasi rutin. Buat tahap
  **`verified_by_sales_admin`** (kelengkapan alamat/syarat bayar/pajak/dokumen) terpisah
  dari persetujuan `nilai`/`kredit`/`special_price` milik manajer.
- **E8.14 Perjalanan pesanan untuk sales (A2)**: satu endpoint ringkas (mis.
  `GET /sales-orders/{id}/journey`) yang menggabungkan status SO + tugas gudang +
  pengiriman + faktur + pembayaran + **sumber pemenuhan** (PR/PO atau transaksi antar-PT),
  read-only, tanpa memberi akses layar gudang.

### FASE E-9 — RANTAI JUAL → BELI INTERNAL → RETUR BERANTAI (skenario pemilik)
> Analisis penuh + bukti per langkah: **`ANALISIS_FLOW_RETUR_BERANTAI.md`**.
> Skenario: Customer A beli lewat Sales A di **Entitas A** → stok kosong → **beli internal
> dari Entitas B** → barang ke Customer A → Customer A retur (Sales A yang mengajukan) →
> barang kembali ke A → **A retur ke B** → B **retur ke supplier atau simpan** →
> kepemilikan kembali ke B. **Kesimpulan verifikasi: rantai sudah didukung ±80%.**
>
> Yang sudah lengkap & terbukti: dokumen kembar antar-PT + kontrak harga internal + faktur
> pajak internal + jembatan gudang dengan pindah kepemilikan & re-home lot + saldo pasangan +
> netting + eliminasi margin · retur pelanggan (kebijakan retur, inspeksi per roll, 4 outcome
> partial, karantina, nota kredit) · retur antar-PT kembar (alasan wajib + dual-control) ·
> retur beli ke supplier (kebijakan impor, siklus kirim/terima supplier).

- **E9.1 (PUTUS #1)** Penerimaan barang antar-PT **tidak memicu** `auto_fulfill_backorders`
  (hanya dipanggil dari `inbound_receiving.py:585` & `qc_service.py:263`). SO tetap
  `waiting_stock` padahal barangnya sudah datang. → panggil dari
  `roll_service.execute_ownership_transfer` (atau `interco_service.receive`) + notifikasi
  ke Admin Sales.
- **E9.2 (PUTUS #2)** `interco_transactions` tanpa `source_order_id` → tak ada jejak "IC ini
  untuk SO-0009". Tiru pola `PR.source="so_repeat"`/`source_ref_id`. Tampilkan janji dari
  PT lain di **Papan Pending SO** (`stock_bucket_service.pending_so_board`). Sama dengan E8.12.
- **E9.3 (RISIKO #3 — DUA JALAN untuk satu peristiwa)** Untuk "A retur ke B" ada
  `POST /api/interco/returns` (benar: harga internal, PPN, IC-AR/AP, eliminasi margin,
  dual-control) **dan** `return_service.transfer_return_roll_ownership` (at-cost, tanpa PPN,
  **tanpa** memperbarui `returned_qty` transaksi asal, **tanpa** memperbarui eliminasi).
  → Bila roll berasal dari pembelian internal: **blokir jalur at-cost** & arahkan ke Retur
  Antar-PT dengan kalimat menuntun (pola yang sudah dipakai `tax_invoice_service.py:195`).
- **E9.4 (RISIKO #4)** Retur antar-PT memilih roll **FEFO per produk**
  (`reserve_rolls_for_transfer`) — bukan roll hasil retur pelanggan (lot `RTN-*`, sering
  grade B) → **roll bagus terkirim balik, roll cacat tinggal**. Tambah parameter `roll_ids`
  + utamakan roll `origin_type="return"` milik dokumen retur terkait.
  Sekaligus: `returnable()` beri peringatan bila barang belum benar-benar kembali.
- **E9.5 (PUTUS #5 — jejak asal hilang)** Roll hasil retur pelanggan dibuat **tanpa**
  `supplier_id`/`po_id`/`po_number`/`supplier_invoice_no`, dan `execute_ownership_transfer`
  **menimpa** `acquired` menjadi `{"via":"transfer"}`. Akibatnya Entitas B **tidak bisa**
  menemukan roll itu sebagai kandidat retur ke supplier (`build_returnable_rolls` menyaring
  `supplier_id`/`po_id`). → wariskan field asal di `_restock_returned_items`, simpan
  `acquired_history[]` saat pindah kepemilikan, dan longgarkan `build_returnable_rolls`
  agar bisa membaca silsilah lot sebagai cadangan.
- **E9.6 (PUTUS #6)** Ketiga retur **tidak saling tertaut**. Pasang relasi dua arah lewat
  `doc_refs_service` (mesin G-4 sudah ada, 79 tautan aktif di demo) + satu layar
  **"Jejak Retur"**: retur pelanggan → retur antar-PT → retur beli / simpan barang.
- **E9.7 Prasyarat**: **L21** (pratinjau alokasi mengabaikan entitas) wajib beres lebih dulu —
  keputusan "beli internal atau tidak" tidak boleh berangkat dari angka stok PT yang salah.
- **E9.8 POC wajib** `backend/test_core_rantai_retur_poc.py` — satu skrip self-cleanup yang
  menjalankan **seluruh skenario pemilik** ujung-ke-ujung dan memeriksa: SO terpenuhi
  otomatis setelah barang antar-PT masuk · saldo IC-AR/AP kembali NOL setelah retur
  antar-PT · PPN keluaran/masukan ikut dibalik · eliminasi margin ikut berkurang ·
  roll yang kembali ke B adalah roll cacat yang benar · roll itu **bisa** diretur ke
  supplier aslinya · ketiga retur saling menunjuk.


- E6.1 POC gabungan `backend/test_core_entitas_poc.py` — satu skrip, self-cleanup, mencakup:
  provisioning (termasuk perorangan) · keunikan prefix · kunci prefix · nomor per-entitas
  anti-tabrakan · pagar deaktivasi & kunci-tulis · akun tertaut HR · pencabutan akses saat
  role berubah · mode "Semua Entitas" hanya-baca · warisan konfigurasi & master per entitas ·
  harga efektif per entitas · **21 kasus kebocoran L1–L21**.
- E6.1b POC kedua `backend/test_core_peran_poc.py` (FASE E-8) — 6 peran × matriks izin:
  sales hanya SO miliknya · sales **403** di faktur pajak/kwitansi/selisih bayar/pegging ·
  `sales_admin` bisa verifikasi+konfirmasi SO & 3 jalur pemenuhan tanpa manajer ·
  `sales_admin` **403** di faktur pajak & kwitansi · `finance` bisa faktur pajak + kwitansi
  tetapi **403** membuat/mengonfirmasi SO · `mark-delivered` oleh gudang & admin sales,
  **403** untuk sales · penugasan multi-entitas untuk `sales_admin` benar-benar mengunci data.
- E6.2 `scripts/audit_entity_isolation.py` = **0 kebocoran**; `bash scripts/gate.sh` hijau;
  `verify_api_contract` 0 ERROR/0 WARN; `check_nav_map` PASS; `audit_i18n_id` 0 temuan.
- E6.3 `testing_agent_v3` — uji **user story** (22 story di §4) di browser dengan
  **6 akun berbeda peran**, bukan hanya API. **Jangan** minta agen uji melakukan
  drag-and-drop/kamera/suara.
- E6.3b Tambah akun demo untuk peran baru di `bootstrap.py`/`seed_realistic.py`
  (`adminsales@kainnusantara.id`, `finance@kainnusantara.id`, + satu Admin Sales yang
  ditugaskan ke 2 entitas) dan catat di `memory/test_credentials.md`.
- E6.4 Perbarui `ENTITY_REGISTRY.md` (business_entities lengkap + warehouses.sharing_mode +
  koleksi yang berubah SHARED→SCOPED), `CODEBASE_MAP.md` (berkas baru), `SESSION_HANDOFF.md`,
  dan `plan.md` (status fase).

#### STATUS E-6 — **SELESAI** (sesi 2026-08-15, repo `wauaualaja/kn`)

| Butir | Status | Bukti |
|---|---|---|
| E6.1 POC entitas gabungan | **SELESAI** (dipecah, bukan satu berkas) | `test_core_e0_isolation_poc.py` · `test_core_e1e2_poc.py` · `test_core_e3_write_guard_poc.py` · `test_core_e4_*` · `test_core_e5_visibility_poc.py` · `test_core_e7_interco_poc.py` — semua terdaftar di `gate.sh --full` |
| E6.1b POC peran (6 peran × matriks izin) | **SELESAI** | `test_core_e8_roles_poc.py` (G1) + `test_core_e8_desk_poc.py` (G2/G3) **97/97** |
| E6.2 audit isolasi 0 kebocoran + gate hijau | **SELESAI** | `audit_entity_isolation` 0 kebocoran · `verify_api_contract` 0/0 · `check_nav_map` PASS 94 layar · `audit_i18n_id` 0 temuan |
| E6.3 agen uji user story di browser | **SELESAI** | iterasi 221 · 222 · putaran-3 (**31/31**, 0 error konsol) |
| E6.3b akun demo peran baru | **SELESAI** | `salesadmin@` (2 entitas) · `finance@` · `sales2@` · `sales3@` — tercatat di `memory/test_credentials.md` |
| E6.4 dokumen diperbarui | **SELESAI** | `plan.md` §8 · `SESSION_HANDOFF.md` · `memory/SESSION_LOG.md` · `memory/HANDOFF.md` |

**Bukti penutup terukur:** `gate.sh --full` **57 gate HIJAU** (224s) ·
`verify_data_integrity` **236 PASS / 0 FAIL / 0 WARN** · POC E-8 G2/G3 **97/97** ·
POC E-9 **44/44** · agen uji putaran-3 **31/31**.

**Dua bug nyata yang ditutup di fase ini** (kelas "hanya terlihat di layar"):
`KN-E6-DASH-SALES-LEAK` (dasbor lupa `sales_ownership` → pesanan rekan bocor ke sales) dan
`KN-E6-DERIVED-FROM-LIST` (field turunan `interco_supply` dibaca dari respons DAFTAR →
pita "dipenuhi dari badan usaha lain" tak pernah tampil, tanpa error). Keduanya diberi
**pagar anti-regresi**: cek `sales_ownership` di POC E-8 + gate statik baru **`INV-UI-04`**
(`guard:derived_fields`).

**Pelajaran metodologis (jangan diulang):** kelas bug #2 lolos SEMUA gate API dan SEMUA POC
backend karena endpoint detailnya memang benar — yang salah adalah **sumber data di layar**.
Sejak sesi ini gate `INV-UI-04` memeriksa hal itu secara statik.

---

## 4) USER STORY (dipakai agen uji sebagai acuan)
1. Sebagai admin, saya menambah **usaha perorangan** "Toko Kain Berkah" lewat wizard 4 langkah,
   melihat pratinjau nomor `BERKAH/SO-00001`, dan mendapat daftar kesiapan yang bisa diklik.
2. Sebagai admin, saya **mengubah** alamat & kop surat entitas yang sudah jalan, tetapi
   **tidak bisa** mengubah kode dokumennya karena sudah menerbitkan faktur — dan sistem
   menjelaskan alasannya.
3. Sebagai admin, saya mencoba menonaktifkan entitas yang masih punya 3 pengguna & 12 dokumen
   terbuka → ditolak dengan rincian; setelah saya pindahkan penggunanya, entitas bisa
   diarsipkan dan **tidak bisa lagi menerima transaksi baru**.
4. Sebagai admin, saya membuat akun baru dengan memilih **karyawan dari HR**; entitasnya
   terisi otomatis dari HR dan tidak bisa saya ubah sembarangan.
5. Sebagai sales yang hanya ditugaskan di CV Kanda Suka, saya **tidak menemukan** satu pun data
   KSC di seluruh aplikasi — termasuk notifikasi, target & insentif saya, denda, piutang, lot,
   dan jejak audit (yang bahkan tidak boleh saya buka).
6. Sebagai sales yang ditugaskan di 2 entitas, saya berpindah entitas dan **seluruh layar**
   (pesanan, pelanggan, stok, harga, laporan) berganti isi — nomor dokumen barunya ber-prefix
   entitas yang sedang aktif.
7. Sebagai admin dalam mode **"Semua Entitas"**, saya bisa melihat gabungan tetapi **tidak
   bisa** membuat dokumen; sistem meminta saya memilih satu entitas dulu.
8. Sebagai admin, di Pusat Pengaturan saya melihat dengan jelas mana nilai **Global** dan mana
   **Entitas ini**, bisa menimpa PPN untuk satu entitas non-PKP, dan bisa mengembalikannya ke global.
9. Sebagai admin, saya menetapkan **harga khusus** satu produk untuk CV Kanda Suka; sales Kanda
   melihat harga itu, sales KSC tetap melihat harga global (dengan lencana asal harga).
10. Sebagai manajer, laporan piutang menampilkan angka **per entitas** dengan nama entitas
    tertulis, dan mode gabungan diberi label tegas.

### User story FASE E-8 (Sales vs Admin Sales)
11. Sebagai **sales lapangan**, saya membuka daftar pesanan dan **hanya melihat pesanan saya**;
    pesanan rekan tidak ada di layar saya.
12. Sebagai **sales**, saya membuka satu pesanan dan melihat **perjalanan barangnya**
    (dipesan → divalidasi → disiapkan → dikirim → diterima → ditagih → dibayar), termasuk
    keterangan "kekurangan 200 yard dipenuhi lewat `PO-00012`" atau "diambil dari
    PT Kain Suka Cita lewat `KANDA/IC-00005`" — **tanpa** bisa menyentuh layar gudang.
13. Sebagai **sales**, saya melihat stok **hanya milik entitas saya** (7 yard), bukan 788 yard
    milik PT lain; bila barang kurang saya menekan **"Minta dari PT lain"** dan permintaan
    itu masuk ke antrean Admin Sales.
14. Sebagai **sales**, saya **tidak lagi menemukan** tombol terbitkan Faktur Pajak, catat
    kwitansi, atau putuskan selisih bayar.
15. Sebagai **Admin Sales**, saya membuka **Meja Admin Sales** dan melihat antreannya dengan
    jumlah: perlu diverifikasi · siap dikonfirmasi · menunggu manajer · siap cetak Surat
    Jalan/Invoice · perlu dipenuhi (kurang stok) · jatuh tempo · retur · permintaan internal
    dari sales. (Faktur pajak & pencatatan uang masuk **bukan** di meja saya — itu Finance.)
16. Sebagai **Admin Sales**, pada `SO-0009` yang kurang 200 yard saya memilih salah satu dari
    **3 tombol**: *Ambil dari PT lain* (lahir transaksi antar-PT **bertaut SO ini**) ·
    *Reorder ke supplier* (lahir PR bertaut SO ini) · *Tahan untuk barang masuk* (pegging).
17. Sebagai **Admin Sales**, saya **memverifikasi** kelengkapan SO (alamat, syarat bayar,
    pajak, dokumen) lalu **mengonfirmasi** SO sehingga tugas gudang lahir — **tanpa**
    menunggu manajer, sementara harga khusus/kredit/nilai besar tetap keputusan manajer.
18. Sebagai **Admin Sales**, retur yang **diajukan sales** masuk ke antrean saya, saya proses
    dokumennya (barang kembali, nota kredit), dan persetujuan akhirnya tetap manajer.
19. Sebagai **manajer**, saya tidak lagi dibebani konfirmasi SO rutin; antrean saya hanya
    berisi keputusan (harga khusus, kredit, nilai besar, pembebasan denda, settlement).
20. Sebagai **Finance/Kasir**, meja saya berisi: **siap terbitkan Faktur Pajak** · **uang
    masuk perlu dicatat & dialokasikan ke invoice** · **selisih bayar** (dalam batas
    kewenangan saya) · **denda perlu diterbitkan** · **jatuh tempo**. Saya **tidak bisa**
    membuat atau mengonfirmasi SO.
21. Sebagai **admin sistem**, saya menugaskan satu Admin Sales ke **2 entitas** (KSC + Kanda)
    dan dia bisa berpindah konteks; Admin Sales lain saya kunci ke 1 entitas dan dia tidak
    menemukan data entitas lain sama sekali.
22. Sebagai **Admin Sales**, saya memutuskan "ambil dari PT lain" untuk `SO-0009`
    **tanpa menunggu persetujuan manajer**; bila pemilik menyalakan ambang rupiah di Pusat
    Pengaturan, transaksi di atas ambang otomatis meminta persetujuan tanpa perubahan kode.

### User story FASE E-9 (rantai jual → beli internal → retur berantai)
23. Sebagai **Admin Sales**, saat barang dari Entitas B **diterima**, pesanan Customer A yang
    tadinya "menunggu stok" **otomatis terpenuhi** dan saya diberi tahu — tanpa alokasi manual.
24. Sebagai **Admin Sales**, di layar pesanan saya melihat "kekurangan 200 yard **diambil dari
    PT Kain Suka Cita** lewat `KANDA/IC-00005`", dan di Papan Pending SO tanggal janjinya ikut
    tampil.
25. Sebagai **Admin Sales**, ketika memproses retur Customer A atas barang yang dulu dibeli
    internal, sistem **mengarahkan saya ke Retur Antar-PT** dan **menolak** jalur pindah
    kepemilikan at-cost, dengan alasan yang dijelaskan.
26. Sebagai **Admin Sales**, roll yang dikirim balik ke Entitas B adalah **roll cacat hasil
    retur pelanggan** (lot `RTN-*`), bukan roll bagus dari stok saya.
27. Sebagai **Finance**, setelah retur antar-PT selesai, **saldo IC-AR/IC-AP kembali nol**,
    PPN keluaran/masukan ikut dibalik, dan eliminasi margin di konsolidasi ikut berkurang.
28. Sebagai **Admin Pembelian Entitas B**, roll yang kembali dari Entitas A **masih bisa saya
    retur ke supplier aslinya** (`Toba Craft`, `PO-00005`) karena jejak asalnya tidak hilang;
    bila barang impor tidak boleh diretur, sistem menyarankan REGRADE + jual lokal.
29. Sebagai **manajer**, satu layar **Jejak Retur** menunjukkan rantainya utuh: retur Customer A
    → retur Entitas A ke Entitas B → retur Entitas B ke supplier (atau "disimpan B").

---

## 5) URUTAN KERJA YANG DISARANKAN
`E-0` → `E-1` → `E-2` → `E-3` → `E-4` → `E-5` → **`E-7`** → **`E-8`** → **`E-9`** → `E-6` (uji & bukti penutup).
E-0 wajib pertama (menutup lubang yang sudah terbukti, termasuk **L21** yang membuat sales
menjanjikan stok PT lain). E-3 (UI) sengaja setelah E-1/E-2
supaya UI dibangun di atas kontrak API yang sudah rapi (hindari bongkar-pasang).
E-7 menunggu keputusan pemilik; bagian pagar-nya (E7.2) boleh naik ke E-0 bila pemilik setuju.

## 6) RISIKO & CARA MENJAGA
| Risiko | Penjagaan |
|---|---|
| Refactor SHARED→SCOPED memutus data lama | Setiap perubahan disertai migrasi backfill idempotent + hitung baris sebelum/sesudah |
| Nomor dokumen kembar saat prefix diubah | Kunci prefix + invalidasi cache + uji tabrakan paralel |
| Regresi kebocoran di modul baru | `scripts/audit_entity_isolation.py` masuk `gate.sh` (fail = merah) |
| UI ambigu (nilai global disangka milik entitas) | Lencana asal wajib + pita entitas aktif + uji agen uji khusus |
| Skala puluhan entitas | Paging + pencarian di daftar entitas, akun, dan pemilih entitas |

## 7) ALAT VERIFIKASI YANG SUDAH ADA (jangan dibuat ulang)
| Berkas | Fungsi |
|---|---|
| `scripts/entity_audit/audit_entity_isolation.py` | Sapuan 300 endpoint GET × 4 identitas → kebocoran, "sama antar-PT", IDOR, sebaran `entity_id` di DB. Output `.logs/audit_isolation_report.md` |
| `scripts/entity_audit/verify_leaks.py` | Bukti baris-demi-baris 11 kandidat kebocoran |
| `scripts/entity_audit/verify_leaks2.py` | Endpoint agregat (papan stok, neraca, AR aging) + master data shared/terpisah + harga |
| `scripts/entity_audit/probe_entity_flow.py` | Siklus hidup entitas: provisioning, duplikat, PATCH, deaktivasi, RBAC |
| `scripts/entity_audit/probe_entity_flow2.py` | Cacat akun: DELETE 405, email duplikat, turun jabatan, entitas nonaktif |
| `scripts/entity_audit/verify_interco.py` | **Cakupan ANTAR-ENTITAS**: meta & 7 kunci konfigurasi, dokumen kembar, saldo pasangan PT, netting, kontrak harga internal, margin, faktur pajak internal, retur antar-PT, jembatan gudang, konsolidasi & eliminasi, RBAC, kas/bank tingkat grup |
| `backend/tests/test_g6_poc.py` | POC antar-entitas resmi (**21/21**, pytest, self-cleanup) |
| `scripts/verify_data_integrity.py` | 233 invarian termasuk **INV-IC-01..08** (antar-entitas) |
| `backend/test_f0c_scoping_leak_poc.py` | POC isolasi resmi (28 PASS) — perluas, jangan ganti |
| `scripts/gate.sh` | 14 gate statik+POC · `scripts/rebuild_frontend.sh` wajib setelah ubah FE |

## 8) STATUS
- [x] **Sesi verifikasi (2026-08-10)** — penelusuran kode + audit empiris + keputusan pemilik + rencana ini.
- [x] **FASE E-0** — 21 kebocoran ditutup + pagar anti-regresi (POC E-0 hijau di `gate.sh`).
- [x] **FASE E-1** — model badan usaha, pagar siklus hidup, kunci prefix, kesiapan, nomor per-entitas.
- [x] **FASE E-2** — akun tertaut HR + penegakan akses (`routers/users.py`).
- [x] **FASE E-3** — layar "Badan Usaha & Akses" + pemilih badan usaha + **mode gabungan
      hanya-lihat** (`backend/entity_write_guard.py`, POC 26/26). Rincian di §FASE E-3.
- [x] **FASE E-4** — master & konfigurasi per badan usaha SELESAI SELURUHNYA
      (E4.1 gudang · E4.2 kop surat · E4.3 master berlapis · E4.4 bagan akun ·
      E4.5/E4.6 Pusat Pengaturan per badan usaha · E4.7 harga). Bukti: gate 34 hijau ·
      POC master berlapis 56/56 · agen uji frontend 12/12. Rincian di §STATUS E-4.
- [x] **FASE E-5** — visibilitas stok SELESAI (E5.1 papan stok agregat · E5.2 pegging ·
      E5.3 mutasi lintas-PT hanya nama singkat · **E5.3c kebocoran BARU Kartu Riwayat Produk
      ditutup**). Bukti: POC E-5 **52/52** (terbukti bisa memerah: 7 FAIL saat disabotase) ·
      `gate.sh --ci` HIJAU dengan gate E-5 baru · agen uji iterasi **216: frontend 23/23**.
      E5.4 dipindah ke E-8. Rincian di §STATUS E-5.
- [x] **FASE E-7** — antar-entitas SELESAI SELURUHNYA (E7a pagar lawan-transaksi-PT-sendiri ·
      E7b konsistensi · E7c HPP taksiran berlabel · E7d Permintaan Internal PIN ·
      E7e kas tingkat grup dihapus · E7f pinjaman antar-PT · E7g pindah aset tetap +
      **E7g-2 cacat "mengaku punya aset yang sudah pindah" ditutup**). Bukti: POC E-7
      **56/56** · `gate.sh --ci` HIJAU · agen uji iterasi **219** + verifikasi tangan
      agen utama untuk pinjaman & pindah aset. Rincian di §STATUS E-7.
- [x] **Sesi 2026-08-14 — gate MERAH G-6b ditutup di akarnya (prasyarat E-9).**
      `POC FASE G-6b test_c1` merah di gate penuh ternyata membongkar cacat **P0
      `KN-G6-ICA-CLOBBER`**: id baris `interco_accounts` dulu tanpa penanda peran, jadi
      *piutang arah A→B* & *utang arah B→A* menempati SATU dokumen — begitu dua PT
      berdagang **dua arah** (Permintaan Internal / pinjaman / pindah aset antar-PT),
      utang **Rp 1.766.010** hilang dari layar tanpa pesan. Ikut ditutup: celah invarian
      **INV-IC-02/04** (dulu hanya memeriksa baris yang ADA → keadaan uang-hilang tetap
      *PASS 8 · FAIL 0*) dan celah residu **POC E-7d** (dokumen kembar `KANDA/IC-#####`
      menumpuk tiap gate; koleksi antar-PT belum dipantau `gate_residue.py`).
      Bukti: bukti-merah POC baru `test_c4_dua_arah_dagang_tidak_saling_menimpa_saldo` ·
      `gate.sh --full` **HIJAU 54/54 dua kali** · POC G-6b 16/16 · G-6 21/21 · E-7 57/57 ·
      integritas 229/0/0. Migrasi: `scripts/migrate_g6b_ica_directional.py`.
      **Catatan penting untuk E-9:** rantai E-9 memang menciptakan arah dagang dua arah
      pada pasangan PT yang sama, jadi tanpa perbaikan ini E-9 akan menghapus saldo sendiri.
- [x] **FASE E-8** — domain sales · admin sales · finance SELESAI (peran `sales_admin` &
      `finance` + registry peran · pemisahan tugas SD2 · kepemilikan data sales E8.4 ·
      Meja Admin Sales & Meja Finance berbasis antrean · tautan SO ↔ Antar Entitas ·
      tahap `verified_by_sales_admin` · perjalanan pesanan untuk sales). Bukti: POC E-8 G1
      hijau · **POC E-8 G2/G3 meja kerja 97/97** · agen uji iterasi 221/222.
- [x] **FASE E-9** — rantai jual → beli internal antar-PT → retur berantai SELESAI
      (pemenuhan otomatis saat barang masuk · pita "dipenuhi dari badan usaha lain" ·
      jalur at-cost DIBLOKIR & menuntun ke Retur Antar-PT · roll `RTN-*` yang dikirim balik ·
      IC-AR/IC-AP kembali nol · retur lanjutan ke supplier asli · layar **Jejak Retur**).
      Bukti: **POC E-9 rantai retur 44/44** · `seed_e9_chain_demo.py` (rantai bisa dibuka
      di layar) · agen uji iterasi 221/222/3.
- [x] **FASE E-6 — UJI & BUKTI PENUTUP SELESAI (sesi 2026-08-15, repo `wauaualaja/kn`).**
      E-6.1 lencana peran (titik `·` dipisah dari label) · E-6.2 POC meja kerja E-8 G2/G3
      didaftarkan sebagai gate + residu ditutup · E-6.4 `gate.sh --full` **57 gate HIJAU** ·
      E-6.5 agen uji putaran-1..3 **31/31** · E-6.7 dokumen diperbarui.
      **Dua BUG NYATA yang hanya bisa ditemukan lewat LAYAR — ditutup di akarnya:**
      1. **`KN-E6-DASH-SALES-LEAK` (US11)** — layar Pesanan tidak memakai `GET /sales-orders`
         melainkan `orders[]` dari `GET /dashboard`, dan dasbor itu hanya menyaring per badan
         usaha (lupa `sales_ownership`) → `sales@` melihat `SO-0008` milik `sales2@` dan KPI
         berbunyi 9. Ditutup: `sales_ownership.apply_scope()` dipasang pada `orders` +
         `active_orders` di `routers/dashboard.py`.
      2. **`KN-E6-DERIVED-FROM-LIST` (US23/US24)** — `interco_supply` adalah field **turunan**
         yang hanya dihitung `GET /sales-orders/{id}`, tetapi panel detail membacanya dari
         objek hasil DAFTAR → blok JSX-nya **selalu di-skip tanpa error**. Ditutup: komponen
         `OrderIntercoSupplyPanel.jsx` mengambil datanya sendiri + **gate baru `INV-UI-04`**
         (field turunan tak boleh dibaca dari respons daftar) supaya kelas bug ini tak lahir lagi.
      **Verifikasi tangan agen utama (bukan hanya laporan agen uji):** `sales@` **8** pesanan
      tanpa `SO-0008` (KPI 8) · `sales2@` **tepat 1** (`SO-0008`) · `salesadmin@` tetap melihat
      seluruh pesanan badan usahanya · panel interco tampil untuk `admin@`/`salesadmin@`/`sales@`
      dengan bunyi "diambil dari CV Kanda Suka lewat `KSC/IC-00006`" dan **nol id teknis `ent_*`** ·
      nol error konsol aplikasi. Rincian di §STATUS E-6.
- **Semua keputusan pemilik sudah terkumpul** (§0 + E7.7 + E8.10/E8.10b).
- [x] **Utang migrasi (i) — DITUTUP (sesi 2026-08-15, repo `skskududu/KN`).** Alat migrasinya
      (`scripts/migrate_e7_group_cash.py --report/--apply`) sudah ada tetapi **belum pernah
      dibuktikan bekerja**, dan data demo hari ini **nol** baris tingkat grup — menjalankannya
      di data bersih hanya mencetak "tidak ada yang perlu dimigrasikan" (kebetulan, bukan bukti).
      Ditutup dengan POC `backend/test_core_group_cash_migration_poc.py` (**38/38**) yang
      MEMBUAT ULANG keadaan warisan (1 rekening "Kas Besar Grup" + 13 transaksi · 4 lapis bukti
      + 2 baris tak terbuktikan), menjalankan alatnya sungguhan, memeriksa baris demi baris,
      lalu memulihkan semuanya (nol residu). **POC ini menemukan cacat nyata di alatnya:**
      baris yang pemiliknya diputuskan ORANG lewat kasus keuangan `salah_entitas` tetap
      menunjuk rekening **GRUP**, sehingga rekening itu tak pernah bisa dinonaktifkan dan uang
      yang sudah punya pemilik duduk di rekening yang konsepnya sudah dihapus → ditambah
      **sapuan kedua** (pindah `account_id` ke cermin badan usaha). Keputusan pemilik untuk
      2 baris tanpa bukti: *"anda atur saja, ini masih demo"* → ditetapkan milik KSC.
- [x] **Utang migrasi (ii) — DITUTUP.** Layar "Cek Peran" berbasis bukti + endpoint terap +
      POC `backend/test_core_role_reality_poc.py` sudah menjadi gate (dikerjakan sesi
      2026-08-15 gelombang pertama; diverifikasi ulang HIJAU di `gate.sh --full` sesi ini).
- [x] **Diparkir → DIKERJAKAN & DITUTUP (sesi 2026-08-15, repo `skskududu/KN`):** analisis
      akses & UI/UX **sales vs admin-sales**, diperluas ke **6 peran** atas bukti bahwa kelas
      cacatnya tidak eksklusif dua peran itu. Rincian di §STATUS F (di bawah).

---

## §STATUS F — SESI 2026-08-15 (repo `skskududu/KN`): AUDIT PERAN · KPI JUJUR · UTANG MIGRASI

> Titik henti sesi lalu: **tepat setelah** mendaftarkan `scripts/audit_sales_roles_ux.py`
> sebagai gate; `gate.sh --full` **MEMERAH di 2 gate**. Keduanya ditutup **di akarnya**
> lalu pekerjaan yang diparkir diselesaikan. Bukti penutup: `gate.sh --full`
> **65 gate HIJAU** (`memory/GATE_RECEIPT.md`) · agen uji frontend **8/8 user story**.

### F-0. Dua gate merah — akar & obatnya
| Gate merah | Akar sebenarnya | Obat |
|---|---|---|
| `guard:auth_coverage` menuduh `GET /sales-return-policies/{policy_id}` tanpa auth | **Tuduhan palsu.** Endpoint itu memakai `require_any_permission` (enforcer "salah satu dari", E-9), tetapi daftar enforcer keras di penjaga hanya mengenal `require_permission`/`require_role` — dan `"require_permission("` **bukan** substring `"require_any_permission("`. Bahaya dua arah: (a) gate merah pada kode benar → penjaganya dimatikan orang; (b) dulu endpoint yang HANYA memakai enforcer itu lolos **karena alasan salah** (kebetulan juga memanggil `entity_ctx`, enforcer LUNAK) → begitu `entity_ctx` dihapus, endpoint tanpa auth pun tetap lolos | `require_any_permission` masuk daftar KERAS + pencocokan **batas kata** (`\bnama\s*\(`) + **`--self-test` 8 kasus** (bukti-merah) yang mengunci kedua arah, didaftarkan sebagai gate baru |
| `INV-GATE-01` anti-residu: `audit_logs` +2 dok tiap gate | Audit baru mengetuk HTTP nyata; tiap `POST /auth/login` menulis satu baris jejak audit. Aturan repo untuk gate runtime: snapshot DB sebelum uji & pulihkan di `finally` | `audit_sales_roles_ux.py` dibungkus `run_with_restore(main)` (`scripts/guardrails/_common.py`); `--self-test` tetap murni statik. Terukur: `audit_logs` 101 → 101 |

### F-2. Audit peran diperluas — dan "panel mati" kini MEMERAH
Audit lama hanya menilai 2 peran dan menganggap **panel mati** (sebagian endpoint layar 403)
sebagai peringatan kuning. Di bawah warna kuning itu hidup **11 kasus nyata**. Sekarang:
- **6 peran** diaudit (`sales`, `sales_admin`, `finance`, `warehouse`, `manager`, + `admin`
  sebagai KONTROL karena berizin `*` — temuan pada admin berarti auditnya sendiri salah).
- **Panel mati = TEMUAN** (gate merah), bukan peringatan.
- Pembebasan "sudah dipagari di kode" kini berkunci **`(layar, path)`**, bukan `path` global —
  kunci global dulu memaafkan `/suppliers` di layar RFQ hanya karena wizard Kontrabon dipagari.
- **Izin yatim** (izin tulis tanpa pintu di layar) dihitung dari bukti: peta
  `(modul, aksi) → endpoint` dibaca statik dari `routers/*.py` (**prefix `APIRouter` ikut
  dibaca** — tanpa itu `/api/pdf/render/...` terbaca `/render/...` dan `document.print`
  selalu terlihat yatim) lalu dicocokkan dengan seluruh URL `${API}/…` di frontend dengan
  pencocokan **wildcard dua arah** (`*` satu segmen, `**` sisa path untuk aksi dinamis seperti
  `` `${API}/purchase-requisitions/${pr.id}${path}` ``). Hasil: **58 tuduhan palsu → 1 sinyal
  jujur** (`approval.approve` — mesin persetujuan generik memang belum punya pintu; lihat F-3).

**11 temuan & obatnya** (keputusan pemilik: *"beri izin baca supaya menunya berguna"*):
| Peran | Layar | 403 | Obat |
|---|---|---|---|
| finance | Aging Piutang | `GET /ar/aging`, `/ar/aging/{id}` | Gerbangnya **berbasis izin**, bukan pangkat peran: `accounting.view` ATAU `penalty.issue` (dulu `require_role(["manager"])` — finance punya menunya DAN izin `penalty.issue`, tetapi tak boleh melihat layarnya) |
| finance | Kasus Keuangan | `GET /suppliers` | `finance + supplier.view` (hanya BACA) **+** daftar opsional dikeluarkan dari `Promise.all`: satu 403 dulu mengosongkan playbook/alasan/kebijakan/pelanggan/rekening sekaligus |
| warehouse | Permintaan Pembelian · RFQ · Retur Beli · Kontrabon | `GET /suppliers` | `warehouse + supplier.view` (peran ini SUDAH punya `rfq.create` & `purchase_requisition.create` tetapi dropdown Supplier-nya kosong tanpa pesan) |
| manager | Karyawan | `GET /users` | `manager + user.view` (hanya BACA; kolom "akun tertaut" dulu selalu kosong → terbaca "belum punya akun") |
| manager | Master Produk/Kategori/UOM | `/products/sales-owners`, `/admin/integrations` | Dipagari **di kode** (jangan memanggil yang tak boleh dipakai): fetch pemilik-produk dikunci `can(product.update)`; `<IntegrationsPanel>` hanya dirender di tab `integrations` |
| warehouse | Retur Beli (detail) | `/gl/cash-accounts` | Fetch akun refund dikunci `canApprove` (pemilihnya pun hanya dirender untuk penyetuju) |
| warehouse | Papan Stok · Kontrabon | `/internal-requests*`, `/bank-accounts` | Sudah dipagari di kode → didaftarkan beserta **alamat pagarnya** di `TERGATED_DI_KODE` |

Ikut ditutup (**INV-ROLE-01**): `ARAgingView` memakai `["admin","manager"].includes(role)`
untuk tombol "Buat Nota Denda" → peran `finance` yang memegang `penalty.issue` melihat
layarnya tanpa tombolnya (server mengizinkan, layar melarang). Kini `can(perms,'penalty','issue')`.

### F-3. FASE BARU (dipilih dari BUKTI KODE, bukan dokumen): **"Pusat Persetujuan = satu pintu yang jujur"**
`MASTER_ROADMAP.md` EPIC 0–6 terbukti sudah dikerjakan (costing/WAC, incentive v2 `per_sku`,
POS, doc-trace, budget+komitmen ada di kode); sisa backlog EPIC 7 **multi-currency/FX**
**tidak** dipilih karena tak ada bukti kebutuhannya (semua supplier domestik, `currency` nol
di PO/supplier, `landed_costs` kosong) — membangunnya berarti menebak. Yang dipilih adalah
cacat yang **terukur** dan muncul dari audit di atas:

- **`KN-F3-KPI-LIES` (P1 senyap)** — KPI "Persetujuan Menunggu" **selalu 0** karena menghitung
  koleksi `approval_requests` yang **tak pernah diisi siapa pun** (`create_approval_request()`
  nol pemanggil), sementara daftar rincian di layar yang sama berbunyi **6** dan kenyataan
  **17**. Satu pertanyaan, tiga angka — dan yang di beranda paling salah.
- Obat: **satu sumber** `backend/services/approval_backlog_service.py` (`QUEUES` = 13 antrean
  nyata, tiap baris menunjuk layar yang ADA) dipakai KPI beranda, rincian beranda, **dan**
  endpoint baru `GET /api/approvals/backlog` (izin `approval.view` / `order.approve`).
- **Control Tower**: KPI jadi **17** (dari 0), berpenjelasan ("Terbanyak: Pesanan pembelian
  (3) · klik untuk buka"), **bisa diklik**, plus panel **"Antrean Persetujuan (17)"** berisi
  baris-baris yang bisa diklik ke tempat kerjanya.
- **Pusat Persetujuan**: ringkasan "Menunggu keputusan (semua jenis): N" + catatan jujur
  **"X di antaranya ditangani di layar lain"** + chip per antrean; chip yang di luar wewenang
  peran **nonaktif** (bukan tautan buntu — tujuan dinilai `resolveDeepLinkTarget`, sumber yang
  sama dengan Ctrl+K & deep-link).
- Ikut ketangkap saat KEDUA angka dipasang di satu layar: baris `amendment` menyebut koleksi
  `amendments` padahal namanya **`doc_amendments`** (`amendments` cuma nama route) → satu
  antrean hilang tanpa pesan. Kelas itu sekarang dijaga invarian **E** di penjaga baru.
- **Gate baru `INV-HOME-01`** (`scripts/guardrails/verify_home_kpi.py`, 6 invarian A–F +
  `--self-test`): KPI == rincian == hitung-ulang mandiri dari MongoDB; anti "angka mati";
  anti layar hantu; anti salah-nama-koleksi; antrean baru wajib punya opini kedua.

### F-4. Bukti penutup sesi ini
`gate.sh --full` **65 gate HIJAU** (dari 61 gate dengan 2 MERAH) · POC F-2 akses peran
**43/43** (termasuk bukti-merah: mencabut izin → POC memerah) · POC F-1b migrasi kas
**38/38** · `audit_sales_roles_ux` **nol layar & panel mati untuk 6 peran** ·
`verify_data_integrity` **236/0/0** · agen uji frontend **8/8 user story** (US-A…US-H) ·
verifikasi tangan agen utama di layar nyata (Control Tower 17 & Pusat Persetujuan
"6 ditangani di layar lain"). Angka antrean **tersaring badan usaha** dan bisa dijelaskan:
KSC **15** · Kanda **2** · gabungan **17**.

### F-5. Berikutnya (usulan berbasis bukti, untuk keputusan pemilik)
1. **Pintu untuk mesin persetujuan generik** — `approval.approve` masih satu-satunya "izin
   yatim" jujur: `POST /approval-requests/{id}/approve|reject` ada, produsennya tidak
   (`create_approval_request()` nol pemanggil). Pilih: hidupkan (aturan ambang → dokumen
   generik) **atau** cabut endpoint+izinnya supaya wewenang di kertas tidak menumpuk.
2. **Kirim dokumen via email (SMTP)** — satu-satunya backlog EPIC 7 yang benar-benar belum
   ada dan grounded (pelanggan/supplier sudah punya kolom `email`; pengiriman baru WhatsApp).
   Butuh kredensial SMTP pemilik.
3. **Ambang persetujuan antar-PT (US22) diuji di layar** — mekanismenya ADA
   (`antar_entitas.approval_threshold_rupiah` → status `waiting_approval`), sekarang antreannya
   sudah terhitung di KPI; belum pernah diuji lewat layar dari ujung ke ujung.
