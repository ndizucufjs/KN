# 🛡️ INVARIANTS REGISTRY — Kain Nusantara ERP/WMS (Guardrail v2)

> **BACA INI DULU jika Anda sesi AI / kontributor baru.** File ini adalah **SSOT**
> dari invariant lintas-kelas-bug yang WAJIB dijaga. Tujuannya menutup masalah utama:
> *konteks hilang antar-sesi* + *kode tumbuh* → kelas bug lama muncul lagi di endpoint baru.
>
> **Aturan emas:** sebelum klaim "selesai", jalankan `bash scripts/gate.sh` dan pastikan **HIJAU**.
> Guardrail v2 memaksa invariant ini secara **statik + runtime** — melanggar = gate MERAH
> dengan pesan **APA + DI MANA + INVARIANT-ID**.

## Kenapa Guardrail v2 ada (pelajaran Sesi #074–#076)
Audit #074–#076 berulang menemukan pola **"green-but-broken" / META-GATE blindness**: gate lama KN
(`verify_data_integrity.py`, 122 invarian) sangat kuat pada **integritas DATA/GL**, tetapi **tidak pernah**
memeriksa **AuthN/AuthZ & isolasi entitas** di permukaan endpoint yang terus bertambah. Akibatnya #076
menemukan 6 endpoint tanpa login + IDOR baca/tulis lintas-entitas — **semuanya lolos** dari gate data.
Metodologi Guardrail v2 (diadaptasi dari proyek Rahaza Travel) mengubah aturan dari *"diingat developer"*
menjadi *"dipaksa analisis kode / uji perilaku"* — sehingga tak bergantung memori sesi.

## Daftar Invariant

| ID | Invariant | Kelas bug dicegah | Penjaga | Lapis | Allowlist / SSOT |
|----|-----------|-------------------|---------|-------|------------------|
| **INV-AUTH-01** | Tiap endpoint `routers/*.py` menegakkan auth (`require_permission`/**`require_any_permission`**/`require_role`/`current_user`/`entity_ctx`, tak ditelan try/except), kecuali publik terdaftar. Pencocokan enforcer memakai **batas kata** (2026-08-15: `require_permission` ≠ `require_any_permission`) + `--self-test` 8 kasus | endpoint tanpa login (AUTH-DOC-PREVIEW, AUTH-MASTER-LEAK #076) **dan** tuduhan-palsu pada enforcer sah (gate yang salah-tuduh akan dimatikan orang → penjaganya hilang) | `scripts/guardrails/verify_auth_coverage.py` (+`--self-test`) | STATIK | `PUBLIC_ALLOWLIST` di skrip |
| **INV-ENTITY-01** | Isolasi multi-PT: peran ter-scope entitas A tak boleh BACA/TULIS dokumen entitas B | IDOR lintas-entitas (IDOR-READ-SUBRES, IDOR-WRITE-INBOUND #076) | `scripts/guardrails/verify_cross_entity.py` | RUNTIME | data seed dua entitas |
| **INV-CONC-01** | Jalur uang/stok atomic: `amount_paid` TAK PERNAH > `grand_total` walau K request paralel (no TOCTOU) | race overpayment (KN-077-RACE-VBILL-PAY \u2014 pembayaran paralel over-bayar) | `scripts/guardrails/verify_concurrency.py` | RUNTIME | \u2014 |
| **INV-STATE-01** | Integritas state-machine SO: cancel melepas roll & task; state terminal tak bisa di-cancel; cancel-ulang idempoten | cancel tak lepas sumber daya / zombie-task / double-cancel | `scripts/guardrails/verify_state_machine.py` | RUNTIME | \u2014 |
| **INV-NUM-01** | Batas-nilai numerik: field money/percent/quantity/count di skema INPUT WAJIB `Field(ge=/gt=[/le=])` — tolak nominal negatif, persen>100, qty≤0 | MONEY-NEG / PCT-OVER / QTY-NONPOS (harga/limit negatif, diskon 999%, qty −5 masuk DB) | `scripts/guardrails/verify_numeric_bounds.py` | STATIK+RUNTIME | `ALLOW_NAMES` di skrip (lat/lng/sort/min_amount/max_amount) |
| **INV-ENTITY-01 (ext)** | Perluasan isolasi multi-PT ke modul NON-FINANSIAL (CRM tulis, WMS ops, HR, RFID, cycle-count, konsolidasi, omnichannel) | IDOR baca/tulis lintas-PT di luar jalur finansial inti (mis. `GET /customers/{id}/credit-status` tanpa cek kepemilikan) | `scripts/guardrails/verify_nonfinancial_sweep.py` | RUNTIME | data seed dua entitas |
| **INV-GL-01** | Tiap `journal_entries` seimbang (Σdebit=Σkredit) + trial-balance global/per-entitas seimbang | JE tak seimbang / GL split | `scripts/verify_data_integrity.py` | DATA | — |
| **INV-DATA-01..NN** | 122 invarian domain (SSOT roll, reservasi, payment_status, dsb) | drift data & state | `scripts/verify_data_integrity.py` | DATA | — |
| **INV-5XX-01** | Endpoint mutasi `{id}` tak boleh 5xx pada input adversarial/salah-state (harus 4xx) | crash 500 (RET-500 #074) | `forensic/fa_s074_errorpath.py`, `forensic/fa_dark_sweep.py` | RUNTIME | payload di skrip |
| **INV-NAV-01** | Navigasi FE selaras SSOT nav | drift nav/role menu | `scripts/check_nav_map.py` | STATIK | `05_NAVIGATION_MAP`/config |
| **INV-COMPLY-01** | file-size, `/api` prefix, env (bukan hardcode), testid, naming | tech-debt & drift lingkungan | `scripts/validate_compliance.py` | STATIK | skrip |
| **INV-UI-01** | Backdrop modal hanya menutup lewat gestur utuh di backdrop (`overlayDismiss()` atau cek `e.target === e.currentTarget`); isi dropdown Radix ber-portal WAJIB `stopPropagation()` | modal tertutup sendiri saat memilih opsi dropdown → isian pengguna hilang (FASE-E-UI-MODAL-CLOSE) | `scripts/guardrails/verify_modal_dismiss.py` | STATIK | `frontend/src/utils/overlayDismiss.js` |
| **INV-UI-02** | Nama entitas SELALU lewat helper bersama; id teknis (`ent_ksc`) tidak boleh tampil ke pengguna | 5 layar menampilkan `ent_ksc` / pilihan entitas Payroll KOSONG | `scripts/guardrails/verify_entity_label.py` | STATIK | `frontend/src/utils/entityLabel.js` |
| **INV-UI-03** | (A) setiap `<ErrorNotice>` WAJIB diberi prop `message`; (B) `ErrorNotice` menormalkan nilai bukan-string lewat `apiErrorText`; (C) modal yang menulis ke API WAJIB punya bilah error SENDIRI (bilah layar induk tertutup lapisan modal) | **KN-G9-ERR-SILENT (P1)**: layar G-8 & G-9 mengirim objek error axios lewat prop `error=` → komponen `return null` → SEMUA penolakan backend (alasan wajib · bukti wajib · kasus kembar · 403 entitas lain) tak terlihat; tombol terasa mati tanpa penjelasan sementara uji backend tetap 100% hijau | `scripts/guardrails/verify_error_notice.py` (+`--self-test` bukti-merah) | STATIK | `frontend/src/utils/apiError.js`, baseline migrasi `MODAL_BASELINE` (hanya boleh MENGECIL) |
| **INV-UI-04** | Field TURUNAN (dihitung endpoint DETAIL, sengaja tidak ada di respons DAFTAR) hanya boleh dibaca oleh berkas frontend yang MEMANGGIL endpoint detail itu sendiri; menumpang objek hasil daftar dilarang. Registry field ada di `DERIVED_FIELDS` | **KN-E9-SUPPLY-INVISIBLE (P1 senyap)**: pita "Dipenuhi dari Badan Usaha Lain" (E9.2 · US23/US24 — "diambil dari CV Kanda Suka lewat KSC/IC-00006") TIDAK PERNAH tampil karena `OrderDetailPanel` membaca `sel.interco_supply` sedangkan `sel` berasal dari `GET /dashboard` → `orders[]` yang tak memuat field turunan → `.length > 0` selalu 0, blok JSX di-skip tanpa error/layar merah/jejak konsol. Backend benar & POC E-9 hijau 44/44 (keduanya menguji endpoint detail, bukan sumber data layar). Risiko: permintaan beli KEDUA untuk barang yang sudah di jalan | `scripts/guardrails/verify_derived_fields.py` | STATIK | `frontend/src/features/orders/OrderIntercoSupplyPanel.jsx` (pola rujukan: panel mengambil datanya sendiri) |
| **INV-HOME-01** | Angka KPI beranda WAJIB sama dengan kenyataan: (A) `approvals_pending` == `approvals.total` di payload yang sama; (B) tiap baris == hitung-ulang MANDIRI dari MongoDB oleh gate (opini kedua); (C) bila ADA dokumen menunggu keputusan, KPI tidak boleh 0; (D) tiap baris menunjuk `view` yang ADA di `AppViewRouter.jsx`; (E) tiap koleksi antrean HARUS ada di DB; (F) tiap antrean punya pasangan hitung-ulang di gate | **KN-F3-KPI-LIES (P1 senyap)**: KPI "Persetujuan Menunggu" di Control Tower & Beranda Manajer memakai `approval_service.get_pending_approvals_count()` yang menghitung koleksi `approval_requests` — koleksi yang **tak pernah diisi siapa pun** (`create_approval_request()` nol pemanggil). Angkanya **selalu 0** sementara daftar rincian di layar yang sama berbunyi 6 dan kenyataan 17 dokumen menunggu (1 SO · 3 PO · 2 harga khusus · 1 PR · 1 retur jual · 2 retur beli · 1 amandemen · 1 opname · 1 spesifikasi · 3 sample · 1 pesanan khusus). Tidak ada error, tidak ada uji gagal: orang yang pekerjaannya MENYETUJUI membaca "0" lalu pulang. Termasuk kelas "salah nama koleksi" (`amendments` vs `doc_amendments` → satu antrean hilang tanpa pesan) | `scripts/guardrails/verify_home_kpi.py` (+`--self-test` bukti-merah) · `backend/test_core_role_access_poc.py` G3/G6 | RUNTIME | `backend/services/approval_backlog_service.py` (`QUEUES` = SSOT definisi antrean) |
| **INV-RCV-01** | Jejak konversi penerimaan LENGKAP: setiap `wms_tasks.scan_log[].uom_trail` yang ada wajib punya `doc_uom`, `doc_qty>0`, `task_uom`, `task_qty>0`, `factor>0` | jejak D-07 setengah jadi → asal angka stok tak bisa diaudit | `scripts/verify_data_integrity.py` (`layer_receiving_uom_invariants`) | DATA | — |
| **INV-RCV-02** | Matematika konversi konsisten: `doc_qty × factor == task_qty` **dan** `task_qty == scan_log[].actual_qty` | angka di layar ≠ angka yang masuk stok (salah kali/bagi satuan supplier) | `scripts/verify_data_integrity.py` | DATA | toleransi pembulatan 0,05 |
| **INV-RCV-03** | Sumber faktor SAH (`same_unit\|supplier_item\|fixed_uom\|product_override\|global_rule\|formula_gsm_width\|hop_base`); `source==supplier_item` ⇒ `supplier_item_id` menunjuk `supplier_items` yang ADA; `receive_uom_trails[]` sinkron dengan `scan_log` | faktor "karangan" / referensi katalog supplier mati / akumulasi jejak melenceng | `scripts/verify_data_integrity.py` | DATA | — |

> **Belum tergerbang (kandidat perluasan, lihat BUG_REGISTRY):** rekonsiliasi **AR** (GL 1-1200 vs subledger —
> temuan AR-GL-DRIFT #076 tak terpantau gate) dan **COGS-ZERO** (baru WARN, belum FAIL).

## Cara menambah invariant baru
1. Tambah penjaga di `scripts/guardrails/verify_*.py` (statik lebih disukai; runtime bila perlu perilaku).
2. Daftarkan di tabel ini + tambahkan ke `scripts/gate.sh` (blok STATIK atau RUNTIME).
3. Sertakan **self-test**: buktikan penjaga MERAH saat invariant dilanggar, HIJAU saat benar.
4. Pengecualian sah harus **eksplisit + beralasan** di allowlist (jangan pernah lolos diam-diam).

## Prinsip anti "hijau-palsu"
Penjaga harus benar-benar menangkap pelanggaran. `verify_auth_coverage.py` & `verify_cross_entity.py`
telah di-self-test terhadap temuan NYATA #076: keduanya **MERAH** pada bug yang belum diperbaiki
(6+ endpoint tanpa auth; 4 kebocoran lintas-entitas) — bukti penjaga bekerja, bukan hijau-palsu.

Gate baru **#079** juga di-self-test terhadap kondisi NYATA:
- `verify_numeric_bounds.py` — **positive control** (`POST /uoms factor_to_base=-1 → 422`, karena `Field(gt=0)`) MEMBUKTIKAN harness sah; lalu MERAH pada 82 field INPUT tanpa bound + 3 leak runtime (credit_limit −5jt, price −1000, dp_percent=999 semua diterima 200 & tersimpan).
- `verify_nonfinancial_sweep.py` — MERAH murni pada `GET /customers/{id}/credit-status` (aktor sales entitas-lain, customer BUKAN miliknya → tetap 200), sementara 360/followup/credit-override benar 403 → membuktikan gate membedakan leak asli vs guard yang bekerja (bukan hijau-palsu / bukan merah-palsu).

Gate baru **Fase E** juga di-self-test terhadap kondisi NYATA:
- `verify_modal_dismiss.py` — MERAH pada backdrop bergaya `onClick={onClose}` mentah (dibuktikan
  dengan berkas uji sintetis: 1 pelanggaran dari 27 cek), HIJAU setelah seluruh 21 backdrop memakai
  `{...overlayDismiss(...)}`. Kelas bug ini NYATA terjadi: memilih supplier di modal
  "Impor Massal Barang Supplier" menutup modal (opsi dropdown yang menjorok berada di atas backdrop,
  plus event React portal merembet ke ancestor React) — lolos dari SEMUA gate lama karena gate lama
  tidak pernah memeriksa perilaku UI.

Gate baru **Fase F-1** (`INV-RCV-01..03`) juga di-self-test terhadap kondisi NYATA:
- Dijalankan pada data POC **sebelum** dibersihkan (17 task inbound, jejak `cone→kg` &
  `roll→yard` nyata) → HIJAU; dan pada data seed demo (1 jejak `5 roll = 200 yard`) → HIJAU.
- Kelas bug yang dicegah: penerimaan menyimpan `received_qty` yang **tidak sama** dengan hasil
  konversi yang ditampilkan ke operator (mis. faktor berubah/berbeda antara pratinjau & submit),
  atau jejak konversi disimpan setengah sehingga asal angka stok tak bisa dipertanggungjawabkan.
- Catatan: `INV-RCV-02` juga membandingkan `scan_log[].actual_qty` dengan `uom_trail.task_qty`
  — bukan hanya matematika internal jejak — sehingga tidak bisa "hijau-palsu" bila router
  menyimpan angka lain ke stok.

---

## FASE G-3 — Selisih Pembayaran (`INV-VAR-01..02`)

Ditambahkan 2026-07-29 di `scripts/verify_data_integrity.py`
(`layer_payment_variance_invariants`). Bahan invariannya disediakan
`services/payment_variance_service.py` agar tidak ada aturan yang dijiplak ke skrip.

- **INV-VAR-01 — setiap selisih punya keputusan BERLABEL.** Keputusan tanpa `reason_code`
  atau tanpa pemutus = **FAIL**. Kwitansi ber-selisih yang belum diputus = **WARN** selama
  masih segar, dan **FAIL** bila dibiarkan menggantung **>7 hari** (inilah yang mencegah
  "ya sudah anggap lunas" pindah dari WhatsApp ke tempat gelap di dalam sistem).
- **INV-VAR-02 — uang tidak hilang.**
  (a) tiap kwitansi non-void: `total_funds == applied_total + unapplied_amount`;
  (b) tiap keputusan yang MEMINDAHKAN uang (`writeoff`/`rounding_writeoff`/`allocate`/
  `refund`/`ap_writeoff`) **wajib punya `je_id`**; (c) alokasi/refund tidak boleh melebihi
  kelebihan bayar kwitansinya.

**Kejujuran cakupan:** kwitansi yang lahir SEBELUM FASE G-3 (mis. dari seed atau
rekonsiliasi bank lama) tidak punya blok `variance` — invarian ini **tidak menuduhnya**
melanggar, karena selisihnya memang belum pernah ditakar. Yang dijaga adalah semua kwitansi
baru yang lewat mesin G-3.

**Bukti-merah (POC `backend/test_g3_variance_poc.py`, 4 penyuntikan):** hapus `reason_code`
sebuah keputusan → INV-VAR-01 MERAH · geser `applied_total` kwitansi → INV-VAR-02a MERAH ·
kosongkan `je_id` keputusan hapus-sisa → INV-VAR-02b MERAH · tuakan kwitansi ber-selisih
jadi 30 hari → INV-VAR-01 MERAH. Semuanya HIJAU lagi setelah dipulihkan, dan setelah
pembersihan POC invarian global kembali **204 PASS / 0 FAIL / 0 WARN**.

---

## INV-BNK-01..03 — REKONSILIASI BANK (FASE G-8)

Lapisan `bank` di `scripts/verify_data_integrity.py` (`--only bank` untuk memeriksa cepat).
Sumber ambang: `config_catalog_bank.py` (grup `bank` di Pusat Pengaturan) — TIDAK ada angka
sihir di dalam skrip invarian.

- **INV-BNK-01 — setiap baris mutasi berstatus jelas & tautannya utuh.** Status wajib
  `unmatched | matched | ignored | holding`. Baris `matched` WAJIB punya tautan dengan
  **Σ alokasi == nominal mutasinya** (tidak ada "tercocok" yang isinya kosong); baris
  `unmatched`/`ignored` TIDAK boleh menyimpan tautan sisa; baris `holding` WAJIB punya
  bukti kas (transaksi kas titipan) dan `teralokasi + sisa == nominal`.
- **INV-BNK-02 — satu transaksi buku tidak bisa dilunasi dua kali.** Untuk setiap
  transaksi kas yang ditaut: `reconciled_amount == Σ alokasi yang menunjuknya` dan
  **tidak pernah melebihi nominalnya**. Inilah yang menjaga split 1:N & gabung N:1 tetap jujur.
- **INV-BNK-03 — dana tak dikenal tidak boleh lenyap dari laporan.** Saldo akun titipan di
  BUKU BESAR (`bank.holding_account_code`, bawaan `2-1950`) harus **sama dengan Σ titipan
  yang belum dialokasikan**. Titipan yang menganggur melebihi `bank.holding_max_age_days`
  dilaporkan **WARN** (antrean tindak lanjut FASE G-9) — dana itu sah, hanya perlu diurus.

**Bukti-merah (POC `backend/test_g8_bank_poc.py`, 3 penyuntikan):** kosongkan `allocations`
baris tercocok → INV-BNK-01 MERAH · geser `reconciled_amount` transaksi buku → INV-BNK-02
MERAH · void-kan jurnal titipan → INV-BNK-03 MERAH. Semuanya HIJAU lagi setelah dipulihkan,
dan setelah pembersihan POC invarian global kembali **214 PASS / 0 FAIL / 0 WARN**.

**Catatan jujur soal cakupan:** `cash_transactions` hasil kwitansi AR lahir TANPA
`account_id` (hanya `cash_type`). Agar penerimaan pelanggan — transaksi yang paling sering
direkonsiliasi — tetap bisa dicocokkan, kandidat mencakup transaksi ber-`account_id` akun itu
**atau** transaksi tanpa akun yang jenis kasnya sama (kolam kas besar/kecil). Lihat
`bank_recon_service._book_query`.
