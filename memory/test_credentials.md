# Test Credentials — Kain Nusantara (data demo `seed_realistic.py`)

> Berkas ini di-.gitignore, jadi **ditulis ulang setiap kali repo dipulihkan ke kontainer baru**.
> Sandi SAMA untuk semua akun demo: `demo12345`

| Email | Peran | Badan usaha (home) | Dipakai untuk |
|---|---|---|---|
| `admin@kainnusantara.id` | admin | PT Kain Suka Cita (`ent_ksc`) | lintas-PT; boleh mode "Semua Entitas" (`X-Entity-Id: all`) |
| `manager@kainnusantara.id` | manager | `ent_ksc` | persetujuan (retur, harga khusus, kredit, nilai besar) |
| `salesadmin@kainnusantara.id` | sales_admin | `ent_ksc` | Meja Admin Sales (verifikasi/konfirmasi SO, 3 jalur pemenuhan) |
| `finance@kainnusantara.id` | finance | `ent_ksc` | faktur pajak, kwitansi, selisih bayar |
| `sales@kainnusantara.id` | sales | `ent_ksc` | sales lapangan PT-A (uji isolasi & "pesanan saya") |
| `sales2@kainnusantara.id` | sales | `ent_ksc` | sales kedua PT-A (uji kepemilikan data antar-sales) |
| `sales3@kainnusantara.id` | sales | **CV Kanda Suka (`ent_kanda`)** | sales PT-B (uji isolasi arah sebaliknya) |
| `warehouse@kainnusantara.id` | warehouse | `ent_ksc` | gudang/penerimaan; **tanpa** izin retur jual (dipakai uji izin rantai retur E9.6b) |
| `warehouse2@kainnusantara.id` | warehouse | `ent_ksc` | gudang kedua |

## Catatan penting
- **Tidak ada akun gudang ber-home CV Kanda Suka.** Aksi gudang di Entitas B dijalankan
  `admin@` (berwenang di kedua badan usaha). Pagar penugasan entitas memang menolak akun
  gudang KSC menyentuh gudang Kanda — itu perilaku yang benar (FASE E-2).
- Pelanggan **"Toko Kain Sejahtera" terblokir kredit**. Untuk membuat pesanan uji pakai
  **"Butik Bali Indah"**, "Fashion Bandung Kencana", atau "Tekstil Medan Jaya".
- Header konteks badan usaha: `X-Entity-Id: ent_ksc | ent_kanda | all`.
  Mode `all` = **hanya-lihat** (pagar tulis `backend/entity_write_guard.py` menolak 409).
- Navigasi UI **berbasis state**, bukan hash: klik `nav-group-{groupId}` → `nav-{id}`.
  Deep-link yang sah hanya `?view=<id>` dan `/verify-document/:id`.

## Data demo FASE E-9 (rantai retur) — dibuat `python seed_e9_chain_demo.py`
Rantai lengkap yang bisa dibuka di layar (nomor bisa berbeda setelah seed ulang):
`KSC/SO-000xx` (dipenuhi dari PT lain) → `KANDA/IC-000xx ↔ KSC/IC-000xx`
→ retur pelanggan `SRET-000xx` → retur antar-PT `KSC/ICR-000xx`
→ retur ke supplier `PRET-000xx`. Buka dokumen retur mana pun → panel **"Jejak Retur"**.
