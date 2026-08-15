# PERF & UI/UX AUDIT + RENCANA PERUBAHAN — KainNusantara ERP
**Tanggal:** 2026-07-23 · **Sifat:** VERIFIKASI (read-only) + RENCANA. Belum ada perubahan kode.
**Basis:** `scripts/ux_audit.py`, `scripts/audit_create_buttons*.py`, grep menyeluruh 220 file `features/*.jsx` + `backend/routers|services`.

---

## RINGKASAN TEMUAN (verifikasi)

### A. Tombol "Buat/Tambah +" yang tidak memunculkan pop-up
- **Tidak ada tombol yang benar-benar mati** (semua punya `onClick`). Masalahnya **KONSISTENSI UX** — ada 3 pola berbeda:
  | Pola | Jumlah | Contoh |
  |------|-------|--------|
  | ✅ MODAL / pop-up (target) | **31 view** | banyak view admin/finance/wms |
  | ⚠️ INLINE form (muncul di dalam halaman, bukan pop-up) | **15 view** | PurchaseReturns, CashManagement, SuppliersView, ChartOfAccounts, BudgetView, BankAccountsView, SupplierPriceList, ProcessRecipesView, MakloonsView, CustomerList, OmnichannelInteractions, PriceApprovals, OrgUnitsView, RfidDevicesView, WhatsAppRules |
  | ⚠️ NAVIGATE ke halaman/detail (bukan pop-up) | **7** | SalesHome (new-order), CycleCount, CashAdvancesView, SettlementsView, PurchaseRequisitions, SpecialOrders, SalesReturns |
- **Inilah yang dirasakan "tidak memunculkan pop-up"**: ~**22 alur create** memakai inline-form / navigate, bukan modal.

### B. Tabel tanpa paginasi & tidak dioptimalkan load  → **AKAR MASALAH PERFORMA**
- **Frontend:** hanya **3 file** menyinggung paginasi; **±198 view** merender tabel/list **penuh tanpa paginasi** (fetch semua baris → render semua).
- **Backend:** mayoritas endpoint list **tanpa** `limit/skip/page`; pakai `.to_list()` besar:
  `59× to_list(2000)`, `31× (5000)`, `29× (10000)`, `17× (20000)`, `7× (100000)`, `5× (50000)`.
  Endpoint inti kembalikan **array telanjang**: `products.to_list(100)`, `purchase-orders.to_list(300)`, `suppliers.to_list(500)`.
- **DB INDEX nyaris tidak ada** — hanya **4 index** (`sessions`×2, `login_attempts`, `products.sku`).
  Koleksi terpanas **tanpa index** pada field query umum → **full collection scan**:
  `inventory_rolls` (111 query), `sales_orders` (92), `products` (86), `purchase_orders` (61), `wms_tasks` (51),
  `inventory_movements` (29), `journal_entries` (30), `customers` (45), `vendor_bills` (38), dst.
- **Bundle FE = 3.0 MB satu file** `main.js`; **`React.lazy` = 0** (tak ada code-splitting) → initial load berat.
- `debounce` hanya di **3 file** (search memicu render tiap ketik).

### C. UI/UX melanggar aturan (guardrails / `ux_audit`)
- `ux_audit.py`: **9 ERROR / 7 file** (tabel tanpa **loading/empty** state, chart tanpa **empty-guard**):
  `PermissionMatrixRecords`, `WhatsAppSettings`, `EquityChangesTab`, `FinanceTowerParts`, `FinanceTowerView`,
  `FinancialStatementsParts`, `CheckoutStep3`. + **2 WARN** uang tanpa `tabular-nums` (`DocumentCenter`, `FinanceTowerView`).
- **`window.alert()` 40×** di **6 file** (WMS: InboundScan/OutboundScan/InventoryStock/TransferManagement, SettingsPanel, EscalationManagement) → wajib ganti `notice`/`ConfirmModal`.
- **`window.confirm()` ±20** perlu direview → `ConfirmModal`.
- Inkonsistensi create-UX (bagian A) = pelanggaran konsistensi komponen.

---

## RENCANA PERUBAHAN (bertahap, performa dulu, risiko-rendah dulu)

### FASE P1 — Fondasi performa Backend: **DB Indexes** (dampak terbesar, risiko UI ~0)
- Buat `ensure_indexes()` (dipanggil saat startup) untuk koleksi terpanas:
  - `inventory_rolls`: `{product_id,warehouse_id,owner_entity_id,status}`, `{status,length_remaining}`, `qc_task_id`, `po_id`, `created_at`.
  - `sales_orders`,`purchase_orders`: `{entity_id,status,created_at}`, `supplier_id/customer_id`, `po_number/so_number`.
  - `inventory_movements`: `{product_id,warehouse_id,timestamp}`, `roll_id`, `ref_id`.
  - `journal_entries`/`gl_*`: `{entity_id,date}`, `ref_id`.
  - `wms_tasks`: `{flow_type,status}`, `po_id`, `so_id`.
  - `customers`,`suppliers`,`vendor_bills`,`products`,`purchase_returns`,`sales_returns`, `audit_logs` (created_at TTL/plain).
- **Deliverable:** modul `backend/indexes.py` + panggil di startup; verifikasi via `explain()` (COLLSCAN→IXSCAN).

### FASE P2 — Paginasi server-side + komponen FE reusable
- **Kontrak paginasi baru** (butuh persetujuan): endpoint terpaginasi kembalikan
  `{ "items": [...], "total": N, "page": p, "page_size": s, "has_more": bool }` + param `?page=&page_size=&q=&sort=`.
  (Endpoint non-list tetap array telanjang → guardrail tetap terjaga.)
- **Backend:** helper `paginate(cursor, page, page_size)` + terapkan ke **list terpanas dulu**:
  inventory rolls & movements, sales_orders, purchase_orders, products, vendor_bills, journal/GL, audit_logs, customers, suppliers, purchase/sales returns. Turunkan `to_list` cap → gunakan `skip/limit`.
- **Frontend:** komponen `Pagination` + hook `usePagedList` (fetch page, loading/empty/error state, **debounced search**). Terapkan ke view terpanas dulu (mirror daftar di atas).
- **Deliverable per modul:** endpoint + view + `data-testid` (`<x>-page-next/prev`, `<x>-search`) + lolos `verify_api_contract`.

### FASE P3 — Optimasi load Frontend (bundle & render)
- **Code-splitting**: `React.lazy` + `Suspense` di `AppViewRouter.jsx` untuk view berat (finance, wms, analytics, hr, pos) → pecah bundle 3 MB.
- `useMemo`/`useCallback` untuk tabel berat; virtualisasi (windowing) untuk list sangat panjang bila masih perlu.
- **Deliverable:** ukuran `main.js` turun signifikan; chunk per-domain.

### FASE P4 — Konsistensi Create → **pop-up (modal)**
- Buat wrapper `FormModal` (di atas `components/ui/dialog`) sbagai standar.
- Konversi **15 view INLINE** → modal pop-up (pertahankan logika form yg ada).
- Evaluasi **7 alur NAVIGATE**: yang ringkas → modal; yang kompleks (mis. `SpecialOrders`) → tetap halaman (konfirmasi user).
- **Deliverable:** semua "+ Buat/Tambah" memunculkan pop-up konsisten (kecuali yang disepakati tetap halaman).

### FASE P5 — Perbaikan aturan UI/UX (agar `ux_audit` 0 ERROR)
- Tambah **loading/empty/chart-empty** state di 7 file ber-ERROR; `tabular-nums` di 2 WARN.
- Ganti **`window.alert`/`confirm`** → `notice bar` / `ConfirmModal` (6+ file).
- Jalankan gate FE: `esbuild`, `ux_audit`(0 ERROR), `verify_api_contract`, `validate_compliance`.

### FASE P6 — Verifikasi (WAJIB via `testing_agent_v3` tiap fase)
- Uji tiap modul yang disentuh: paginasi (next/prev/search), create-modal muncul & submit, tidak ada regresi, angka & state benar.

---

## URUTAN & PRIORITAS USULAN
1. **P1 (indexes)** — cepat, dampak besar, aman. 2. **P2 (paginasi)** per-modul terpanas. 3. **P3 (bundle)**.
4. **P4 (create modal)**. 5. **P5 (aturan UI/UX)**. Verifikasi (P6) menyertai tiap fase.

## KEPUTUSAN YANG DIBUTUHKAN DARI USER
- Setujui **kontrak paginasi** `{items,total,page,page_size,has_more}`? (default `page_size` 25/50?)
- Modul mana didahulukan untuk paginasi?
- `SpecialOrders`/create kompleks: tetap halaman atau paksa modal?

---

## STATUS IMPLEMENTASI (progress log)

**Keputusan user (disetujui):** urutan P1→P2→P3→P4→P5; kontrak paginasi
`{items,total,page,page_size,has_more}` + `?page=&page_size=&q=&sort=`;
default page_size **20**; urutan modul terpanas bertahap; alur create kompleks tetap halaman.

### ✅ P1 — DB Indexes (SELESAI, terverifikasi)
- `backend/indexes.py` → `ensure_performance_indexes()` dipanggil di `bootstrap.run_bootstrap()`.
- 75+ index (compound + single) untuk 25 koleksi terpanas (inventory_rolls, inventory_movements,
  sales_orders, purchase_orders, wms_tasks, journal_entries, gl_*, vendor_bills, customers,
  suppliers, products, returns, audit_logs, notifications, dll).
- Idempotent & non-fatal. Verifikasi: query `inventory_rolls` kini **IXSCAN** (dulu COLLSCAN).

### ✅ P2 — Server-side Pagination (INFRA + 5 view, terverifikasi 100% oleh testing agent)
- Infra: `backend/pagination.py` (is_paged/get_page_params/build_search/fetch_page/envelope),
  `frontend/src/hooks/usePagedList.js` (debounce+guard urutan respons), `components/PaginationBar.jsx`.
- **OPT-IN & backward compatible**: endpoint balikan envelope hanya bila `?page/?page_size` ada;
  tanpa itu tetap array telanjang (konsumen lama + gate `verify_api_contract` aman).
- Endpoint ter-paginasi: `/inventory/rolls`, `/inventory/movements`, `/purchase-orders`,
  `/vendor-bills`, `/suppliers`, `/customers`, `/purchase-returns`, `/sales-returns`, `/audit-logs`
  + endpoint agregasi `/vendor-bills/status-counts` (jaga badge tab tanpa fetch semua).
- View ter-migrasi: InventoryStockView (tab Rolls & Ledger), CustomerList, SuppliersView,
  PurchaseOrderManagement, VendorBillsView. Search server-side + PaginationBar + loading/empty.
- **SISA P2 (belum):** SalesReturns & PurchaseReturns (stats per-status → butuh endpoint
  status-counts seperti vendor-bills), OrdersView (sales — prop-fed dari /dashboard, perlu
  refactor jadi self-fetch + agregat), GL journal `/gl/journal` (Finance).

### ✅ P3 — Code-splitting (SELESAI, terverifikasi)
- `AppViewRouter.jsx`: semua view feature → `React.lazy()` + satu `<Suspense>` (fallback ViewLoader).
- Hasil: **main.js 3.0MB → 892KB (-70%)**, 85 chunk on-demand. Uji nav PO/GL/WMS/Sales/HR:
  nol console/page/chunk error.

### ⏳ P4 — Create jadi modal (BELUM): ~15 view form inline → FormModal; alur kompleks tetap halaman.
### ⏳ P5 — UI/UX rules (BELUM): loading/empty state file backlog (9 ERROR ux_audit), ganti
       `window.alert` (40×) & `window.confirm` (~20×) dgn toast/ConfirmModal.
