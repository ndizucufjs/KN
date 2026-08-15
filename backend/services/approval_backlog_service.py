"""services/approval_backlog_service.py — SATU sumber "apa yang menunggu keputusan".

MASALAH YANG DISELESAIKAN (terukur 2026-08-15)
=============================================
Angka "berapa yang menunggu persetujuan" dulu dihitung di TIGA tempat berbeda dan
ketiganya tidak pernah sama:

  1. KPI beranda (`home_service`) → `approval_service.get_pending_approvals_count()`
     yang menghitung koleksi `approval_requests`. Koleksi itu **tak pernah diisi
     siapa pun** (`create_approval_request()` nol pemanggil) → KPI SELALU **0**.
  2. Daftar rincian di beranda manajer → 4 baris buatan sendiri → **6**.
  3. Layar "Pusat Persetujuan" → 7 sumber yang diambil & dihitung di BROWSER,
     jadi angkanya hanya sebesar yang boleh dibaca peran itu.

Kenyataan di basis data: **16** dokumen memang menunggu keputusan. Orang yang
pekerjaannya menyetujui melihat "0" di berandanya lalu pulang; kalau ia membuka
Pusat Persetujuan ia melihat angka ketiga lagi. Tidak ada error, tidak ada uji
yang gagal — hanya angka yang berbohong.

Modul ini menjadi SATU-SATUNYA tempat definisi itu ditulis. KPI beranda, rincian
beranda, dan ringkasan Pusat Persetujuan semuanya membaca dari sini, sehingga
mustahil berbeda pendapat. Penjaga `scripts/guardrails/verify_home_kpi.py`
(INV-HOME-01) menegakkannya lewat HTTP nyata + hitung-ulang mandiri dari MongoDB.

ATURAN MENAMBAH ANTREAN BARU
---------------------------
Satu baris = satu keadaan dokumen yang MENUNGGU KEPUTUSAN ORANG, dan `view`-nya
WAJIB layar yang benar-benar ada di `AppViewRouter.jsx` (dijaga invarian D). Jangan
menambah baris yang tak punya tempat kerja — angka tanpa jalan hanya membuat panik.
"""
from typing import Any, Dict, List, Optional
from db import db

#: (kunci, label, layar tujuan, koleksi, query) — urut sesuai kelaziman kerja.
QUEUES: List[tuple] = [
    ("sales_order", "Pesanan penjualan menunggu ACC", "approval-inbox", "sales_orders",
     # SSOT persetujuan SO = `pending_approvals`; `status` lama tetap dihitung supaya
     # dokumen tahap sebelumnya tidak hilang dari antrean.
     {"$or": [{"status": "waiting_approval"}, {"pending_approvals.status": "pending"}]}),
    ("purchase_order", "Pesanan pembelian menunggu ACC", "purchase-approval",
     "purchase_orders", {"status": "waiting_approval"}),
    ("price", "Permintaan harga khusus", "price-approvals", "price_approvals",
     # yang tertaut SO sudah terhitung di baris `sales_order` (hindari dobel).
     {"status": "pending", "$or": [{"so_id": ""}, {"so_id": None},
                                   {"so_id": {"$exists": False}}]}),
    ("purchase_requisition", "Permintaan pembelian (PR) menunggu ACC",
     "purchase-requisitions", "purchase_requisitions", {"status": "pending_approval"}),
    ("sales_return", "Retur jual menunggu ACC", "returns", "sales_returns",
     {"status": "pending_approval"}),
    ("purchase_return", "Retur beli menunggu ACC", "purchase-returns", "purchase_returns",
     {"status": "pending_approval"}),
    ("amendment", "Koreksi & amandemen menunggu ACC", "amendments", "doc_amendments",
     # Koleksinya `doc_amendments` (bukan `amendments` — itu nama ROUTE-nya). Versi
     # pertama baris ini salah menebak nama koleksi sehingga menghitung 0 sementara
     # layar Pusat Persetujuan menampilkan 1 amandemen menunggu: ketidaksesuaian itu
     # langsung terlihat begitu KEDUA angka dipasang di satu layar — alasan kenapa
     # ringkasan antrean ditaruh persis di atas daftarnya.
     {"status": "pending_approval"}),
    ("interco", "Transaksi antar-PT menunggu ACC", "interco-transactions",
     # US22 — di atas `antar_entitas.approval_threshold_rupiah` transaksi antar-PT
     # otomatis menunggu persetujuan. Tanpa baris ini ambang itu menahan uang
     # tanpa satu pun angka yang memberi tahu siapa pun.
     "interco_transactions", {"status": "waiting_approval"}),
    ("cycle_count", "Stock opname menunggu ACC", "operations", "cycle_count_sessions",
     {"status": "submitted"}),
    ("rnd_spec", "Spesifikasi desain menunggu ACC", "rnd-specs", "md_specs",
     {"status": "review"}),
    ("rnd_sample", "Sample menunggu keputusan", "rnd-samples", "md_samples",
     {"status": {"$in": ["in_progress", "assessed"]},
      "decision.supplier_id": {"$in": ["", None]}}),
    ("special_order", "Pesanan khusus menunggu ACC", "special-orders", "special_orders",
     {"status": "pending_approval"}),
    ("generic", "Permintaan persetujuan lain", "approval-inbox", "approval_requests",
     # Mesin persetujuan generik. Nol selama tak ada yang mengisinya — tetap dihitung
     # supaya kalau kelak dinyalakan, dokumennya TIDAK hilang dari pandangan.
     {"status": "pending"}),
]


def _scope(entity_id: Optional[Any]) -> Dict[str, Any]:
    """Saringan badan usaha. Menerima `str`, `{"$in": [...]}`, atau kosong (gabungan)."""
    if not entity_id or entity_id == "all":
        return {}
    return {"entity_id": entity_id}


async def backlog(entity_id: Optional[str] = None) -> Dict[str, Any]:
    """`{total, items (hanya yang > 0), all_items}` — antrean keputusan yang NYATA."""
    scope = _scope(entity_id)
    rows: List[Dict[str, Any]] = []
    for key, label, view, coll, query in QUEUES:
        try:
            count = await db[coll].count_documents({**scope, **query})
        except Exception:  # noqa: BLE001 — koleksi belum ada di instalasi baru
            count = 0
        rows.append({"key": key, "label": label, "view": view, "count": int(count)})
    return {"total": sum(r["count"] for r in rows),
            "items": [r for r in rows if r["count"] > 0], "all_items": rows}
