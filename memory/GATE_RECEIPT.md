# 🧾 GATE RECEIPT — Kain Nusantara

> Bukti verifikasi otomatis. Dihasilkan `scripts/gate.sh`. JANGAN edit manual.

- **Waktu:** 2026-08-16 03:37:03
- **Mode:** `full`  ·  **Durasi total:** 259s  ·  **Pekerja statik:** 2
- **Backend:** RUNNING + auth siap (gate runtime dijalankan)

| Gate | Hasil |
|------|-------|
| guard:auth_coverage (INV-AUTH-01) | PASS (0s) |
| guard:auth_coverage SELF-TEST (bukti-merah penjaga auth) | PASS (0s) |
| validate_compliance (file/naming/docs/api/env) | PASS (2s) |
| check_nav_map (navigasi vs SSOT) | PASS (0s) |
| guard:modal_dismiss (INV-UI-01, modal auto-close) | PASS (1s) |
| config_wiring (INV-CFG-01/04, satu sumber kebenaran) | PASS (1s) |
| config_wiring SELF-TEST (bukti-merah guardrail) | PASS (7s) |
| audit_doc_refs SELF-TEST (bukti-merah relasi dokumen) | PASS (0s) |
| audit_i18n_id (label antarmuka Bahasa Indonesia) | PASS (1s) |
| audit_i18n_id SELF-TEST (bukti-merah guardrail bahasa) | PASS (0s) |
| fix_i18n_id SELF-TEST (codemod tak boleh sentuh kode) | PASS (1s) |
| guard:entity_label (INV-UI-02, id entitas tak boleh tampil) | PASS (0s) |
| guard:error_notice (INV-UI-03, error tak boleh senyap) | PASS (0s) |
| guard:role_label (INV-ROLE-01, peran dari registry & izin) | PASS (1s) |
| guard:derived_fields (INV-UI-04, field turunan tak boleh dari respons daftar) | PASS (0s) |
| audit_entity_isolation SELF-TEST (bukti-merah pagar isolasi) | PASS (1s) |
| guard:write_scope SELF-TEST (INV-ENTITY-02, mode gabungan hanya-lihat) | PASS (1s) |
| guard:warehouse_scope SELF-TEST (E4.1, gudang khusus badan usaha) | PASS (1s) |
| guard:numeric_bounds (INV-NUM-01, statik+runtime) | PASS (1s) |
| seed_realistic (data uji bersih) | PASS (15s) |
| verify_data_integrity (229 invarian domain/GL/alert/ledger/config/relasi/pembayaran/selisih/bank/kasus/kontrabon/antar-entitas) | PASS (2s) |
| verify_entity_scoping (F0-C, DB + STATIK anti-kebocoran PT) | PASS (1s) |
| audit_doc_refs (INV-REF cakupan data + kesehatan tautan) | PASS (1s) |
| guard:cross_entity (INV-ENTITY-01, IDOR multi-PT) | PASS (1s) |
| guard:nonfinancial_sweep (INV-ENTITY-01+, IDOR non-finansial) | PASS (1s) |
| POC F0-C (isolasi lintas-entitas: kartu asal · roll retur · jejak UoM) | PASS (2s) |
| audit_entity_isolation (E0.9/E0.10 — 0 kebocoran lintas-entitas) | PASS (5s) |
| POC FASE E-0 (bukti-merah L1–L21: notifikasi·denda·audit·lot·AR·transfer·dokumen·pratinjau) | PASS (2s) |
| POC FASE E-3 (mode “Semua Entitas” hanya-lihat: 409 menuntun · master bersama tetap boleh) | PASS (2s) |
| POC FASE E-4 (gudang bersama/khusus · harga per badan usaha · CSV) | PASS (3s) |
| POC FASE E-4 master berlapis (global→badan usaha · override · kop surat per PT) | PASS (3s) |
| POC FASE E-5 (papan stok agregat · pegging · mutasi lintas-PT nama singkat · kartu riwayat) | PASS (1s) |
| POC FASE E-7 (pagar entitas grup · HPP taksiran berlabel · permintaan internal · kas grup dihapus · pinjaman & pindah aset antar-PT) | PASS (4s) |
| POC FASE E-8 G1 (peran sales_admin & finance · pemisahan tugas · penugasan entitas) | PASS (3s) |
| POC FASE E-8 G2/G3 (meja admin sales & finance · verifikasi · keputusan pemenuhan) | PASS (5s) |
| POC FASE E-9 (rantai jual→beli internal antar-PT→retur berantai · 41 pemeriksaan) | PASS (3s) |
| POC Cek Kenyataan Peran (utang migrasi ii E-8 · usulan peran dari jejak nyata) | PASS (2s) |
| audit_sales_roles_ux SELF-TEST (bukti-merah penilaian layar mati) | PASS (0s) |
| audit_sales_roles_ux (SEMUA peran: nol layar & panel mati) | PASS (38s) |
| POC F-2 Akses & UI/UX per peran (izin baca · pagar · KPI jujur · bukti-merah) | PASS (3s) |
| POC F-1b Migrasi kas tingkat grup (utang migrasi i · 4 lapis bukti · idempotent) | PASS (4s) |
| POC Pengingat Antrean Persetujuan (umur tunggu · eskalasi · idempotent · ambang pemilik) | PASS (1s) |
| guard:home_kpi SELF-TEST (bukti-merah penjaga KPI beranda) | PASS (0s) |
| guard:home_kpi (INV-HOME-01, KPI beranda = antrean nyata) | PASS (2s) |
| guard:concurrency (INV-CONC-01, race/TOCTOU uang) | PASS (1s) |
| guard:state_machine (INV-STATE-01, transisi SO) | PASS (1s) |
| audit_endpoint_sweep (semua GET → 5xx · paralel) | PASS (3s) |
| health_check (isi endpoint kritis) | PASS (2s) |
| INV-GATE-01 anti-residu (gate tak boleh merusak data) | FAIL (1s) |
| POC FASE G-0 (fondasi konfigurasi) | PASS (12s) |
| POC FASE G-1 (amandemen ber-alasan) | PASS (3s) |
| POC FASE G-4 (relasi dokumen · referensi cetak · tanda tangan) | PASS (12s) |
| POC FASE G-2 (rencana pembayaran & denda) | PASS (12s) |
| POC FASE G-3 (selisih pembayaran lebih/kurang bayar) | PASS (11s) |
| POC FASE F-1 (penerimaan satuan supplier) | PASS (3s) |
| POC FASE F (R&D · labdip/proofing · lifecycle produk) | PASS (13s) |
| POC FASE F US3/US11/US12 (gating jual · mutasi sample · jejak dokumen) | PASS (1s) |
| POC FASE D (makloon rantai proses) | PASS (4s) |
| POC FASE G-8 (rekonsiliasi bank · titipan dana · isolasi PT) | PASS (15s) |
| POC FASE G-9 (pusat kasus keuangan · 11 playbook · SLA · dokumen turunan) | PASS (13s) |
| POC FASE G-7 (kontrabon · potongan · toleransi config · bayar sekali) | PASS (11s) |
| POC FASE G-6 (antar entitas · dokumen kembar · netting · eliminasi margin) | PASS (8s) |
| POC FASE G-6b (faktur pajak internal · retur antar-PT · pengingat · margin) | PASS (11s) |
| INV-GATE-01 anti-residu FASE POC (POC tak boleh menggeser stok/dokumen) | PASS (1s) |
| seed_realistic (pulihkan data demo setelah FASE POC) | PASS (12s) |
| verify_data_integrity (ulang, pasca pemulihan data) | PASS (3s) |

## ❌ VERDICT: MERAH — ADA GATE GAGAL. Lihat memory/BUG_REGISTRY.md. Perbaiki lalu jalankan ulang.

**Tingkatan:** `--quick` (statik ~7s) · default (~25s) · `--ci` (default + receipt JSON) · `--full` (+POC fase ~95s).

_Catatan: SKIP bukan PASS. Gate runtime harus dijalankan ulang saat backend hidup._
