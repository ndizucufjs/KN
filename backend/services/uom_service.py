"""Sub-fase 1.13 — UOM Conversion Engine (Multi-UOM).

Mendukung konversi multi-unit untuk penjualan/pembelian kain:
- FIXED (global, dari koleksi `uoms.factor_to_base` + kanonik): meter=1, yard=0.9144,
  cm=0.01, inch=0.0254. (base_type = length)
- VARIABLE (per produk, dari `product.uom_conversions[]`): mis. 1 roll = 50 m
  ({from_unit:"roll", to_unit:"meter", factor:50}). Beda tiap produk.

Resolusi faktor: unit sama → 1.0 → FIXED langsung → VARIABLE langsung → 1-hop via base unit.
Jika tidak ada faktor → HTTPException 400 (TIDAK diam-diam pakai 1).

Semua qty inventori/reservasi/movement SELALU disimpan dalam BASE UNIT produk (default meter).
Fungsi inti bersifat pure (tanpa I/O) supaya mudah diuji; `load_fixed_factors()` async hanya
membaca peta faktor FIXED dari DB sekali per request.
"""
from typing import Any, Dict, Optional
from fastapi import HTTPException
from db import db

# Faktor length kanonik (meter per 1 unit) — fallback bila uoms belum punya factor_to_base.
CANONICAL_LENGTH_FACTORS: Dict[str, float] = {
    "meter": 1.0, "m": 1.0, "mtr": 1.0,
    "yard": 0.9144, "yd": 0.9144, "yrd": 0.9144,
    "cm": 0.01, "centimeter": 0.01,
    "inch": 0.0254, "in": 0.0254,
}


def _norm(u: Optional[str]) -> str:
    return (u or "").strip().lower()


async def load_fixed_factors() -> Dict[str, float]:
    """Peta {unit(lowercase) -> meter per 1 unit} dari uoms (base_type=length) + kanonik."""
    factors: Dict[str, float] = dict(CANONICAL_LENGTH_FACTORS)
    uoms = await db.uoms.find({"base_type": "length"}, {"_id": 0}).to_list(200)
    for u in uoms:
        f = u.get("factor_to_base")
        if f in (None, 0):
            continue
        for key in (u.get("name"), u.get("code")):
            if key:
                factors[_norm(key)] = float(f)
    return factors


def _fixed(from_u: str, to_u: str, fixed: Dict[str, float]) -> Optional[float]:
    a, b = fixed.get(from_u), fixed.get(to_u)
    if a is not None and b not in (None, 0):
        return a / b
    return None


def _pair(from_u: str, to_u: str,
          pair_rules: Optional[Dict[Any, Any]]) -> Optional[Dict[str, Any]]:
    """FASE B — faktor dari registry aturan GLOBAL (`uom_conversion_rules`).

    `pair_rules` = {(from,to): {factor, rule_id, kind}} (lihat
    `services/uom_rules_service.load_pair_rules`). Aturan dianggap dua arah:
    bila hanya ada (to,from), dipakai kebalikannya.
    """
    if not pair_rules:
        return None
    hit = pair_rules.get((from_u, to_u))
    if hit and float(hit.get("factor") or 0) > 0:
        return {"factor": float(hit["factor"]), "rule_id": hit.get("rule_id", ""),
                "kind": hit.get("kind", "fixed"), "reversed": False}
    rev = pair_rules.get((to_u, from_u))
    if rev and float(rev.get("factor") or 0) > 0:
        return {"factor": 1.0 / float(rev["factor"]), "rule_id": rev.get("rule_id", ""),
                "kind": rev.get("kind", "fixed"), "reversed": True}
    return None


def _variable(product: Dict[str, Any], from_u: str, to_u: str) -> Optional[float]:
    for c in product.get("uom_conversions", []) or []:
        cf, ct, fac = _norm(c.get("from_unit")), _norm(c.get("to_unit")), c.get("factor")
        if not fac:
            continue
        if cf == from_u and ct == to_u:
            return float(fac)
        if cf == to_u and ct == from_u and float(fac) != 0:
            return 1.0 / float(fac)
    return None


# FASE F-1 — base unit yang MEMANG satuan berat: kg per 1 base unit = fisika murni
# (tidak butuh gramasi/lebar). Dipakai `kg_per_base_unit()` agar penerimaan produk
# per-kg (benang, obat celup) tidak lagi mustahil diselesaikan.
WEIGHT_BASE_KG: Dict[str, float] = {
    "kg": 1.0, "gram": 0.001, "ton": 1000.0, "lbs": 0.45359237, "ounce": 0.0283495231,
}


def product_kg_per_meter(product: Dict[str, Any]) -> float:
    """Faktor catch-weight: kg per 1 BASE unit (meter).

    Prioritas: field eksplisit `kg_per_meter` (>0) → else turunan `gramasi(gsm) × lebar(m) / 1000`.
    Mengembalikan 0.0 bila tidak tersedia (produk tanpa data berat).
    """
    try:
        explicit = float(product.get("kg_per_meter") or 0)
    except (TypeError, ValueError):
        explicit = 0.0
    if explicit > 0:
        return explicit
    try:
        gsm = float(product.get("gramasi") or 0)
        width = float(product.get("lebar") or 0)
    except (TypeError, ValueError):
        return 0.0
    v = gsm * width / 1000.0
    return v if v > 0 else 0.0


def kg_per_base_unit(product: Dict[str, Any],
                     fixed: Optional[Dict[str, float]] = None) -> float:
    """FASE B — berat (kg) per 1 **BASE UNIT produk**.

    `product_kg_per_meter()` menghasilkan kg per **METER** (GSM × lebar ÷ 1000).
    Bila base unit produk bukan meter (mis. **yard**), nilai itu WAJIB dikalikan
    meter-per-base-unit (1 yard = 0,9144 m) — kalau tidak, berat akan salah ~9,4%
    untuk seluruh produk berbasis yard (bug lama Sub-fase 1.13/Fase 8 yang
    diperbaiki di Fase B).

    FASE F-1 (bug `KN-F1-KGBASE-GR`) — bila base unit produk **memang satuan berat**
    (benang per `kg`, obat celup per `kg`/`gram`, dsb), faktor kg-per-base-unit adalah
    **FISIKA murni** dan TIDAK butuh gramasi/lebar. Sebelum perbaikan ini fungsi
    mengembalikan 0 untuk produk berbasis kg tanpa gramasi, sehingga
    `resolve_roll_measures()` menolak menyelesaikan Goods Receipt
    ("tak bisa menurunkan panjang dari berat") — artinya **seluruh penerimaan benang
    & bahan kimia mustahil diselesaikan**. `makloon_calc_service` sudah lama
    men-hardcode `1.0` untuk `kg`, jadi perbaikan ini menyeragamkan aturan ke SSOT.
    """
    base = _norm(product.get("base_unit", "meter"))
    if base in WEIGHT_BASE_KG:
        return WEIGHT_BASE_KG[base]
    kg_per_m = product_kg_per_meter(product)
    if kg_per_m <= 0:
        return 0.0
    if base in ("meter", "m", "mtr", ""):
        return kg_per_m
    factors = dict(CANONICAL_LENGTH_FACTORS)
    if fixed:
        factors.update({k: v for k, v in fixed.items() if v})
    m_per_base = factors.get(base)
    if not m_per_base or m_per_base <= 0:
        return kg_per_m               # base unit non-panjang (roll/pcs) → biarkan apa adanya
    return kg_per_m * float(m_per_base)


def _catch_weight(product: Dict[str, Any], from_u: str, to_u: str,
                  fixed: Optional[Dict[str, float]] = None) -> Optional[float]:
    """Sub-fase 1.13 / Fase 8 — konversi kg ↔ base unit produk via catch-weight.
    kg per 1 base unit = `kg_per_base_unit()` (GSM × lebar ÷ 1000, disesuaikan base unit).
    """
    base = _norm(product.get("base_unit", "meter"))
    kg_per_base = kg_per_base_unit(product, fixed)
    if kg_per_base <= 0:
        return None
    if from_u == "kg" and to_u == base:
        return 1.0 / kg_per_base          # base unit per 1 kg
    if from_u == base and to_u == "kg":
        return kg_per_base                # kg per 1 base unit
    return None


def _resolve(product: Dict[str, Any], from_u: str, to_u: str, fixed: Dict[str, float],
             pair_rules: Optional[Dict[Any, Any]] = None) -> Optional[float]:
    """Faktor konversi (angka saja). FASE B: aturan GLOBAL ikut dipertimbangkan.

    Urutan: sama → FIXED (uoms/kanonik) → per-produk (`uom_conversions`) →
    aturan GLOBAL (`uom_conversion_rules`) → catch-weight (GSM × lebar) → 1-hop base.
    """
    if from_u == to_u:
        return 1.0
    direct = _fixed(from_u, to_u, fixed)
    if direct is not None:
        return direct
    var = _variable(product, from_u, to_u)
    if var is not None:
        return var
    glob = _pair(from_u, to_u, pair_rules)
    if glob is not None:
        return glob["factor"]
    cw = _catch_weight(product, from_u, to_u, fixed)
    if cw is not None:
        return cw
    # 1-hop lewat base unit produk (mis. roll -> meter -> yard, atau kg -> meter -> yard)
    base = _norm(product.get("base_unit", "meter"))
    if from_u != base and to_u != base:
        f1 = _fixed(from_u, base, fixed)
        if f1 is None:
            f1 = _variable(product, from_u, base)
        if f1 is None:
            _g1 = _pair(from_u, base, pair_rules)
            f1 = _g1["factor"] if _g1 else None
        if f1 is None:
            f1 = _catch_weight(product, from_u, base, fixed)
        f2 = _fixed(base, to_u, fixed)
        if f2 is None:
            f2 = _variable(product, base, to_u)
        if f2 is None:
            _g2 = _pair(base, to_u, pair_rules)
            f2 = _g2["factor"] if _g2 else None
        if f2 is None:
            f2 = _catch_weight(product, base, to_u, fixed)
        if f1 is not None and f2 is not None:
            return f1 * f2
    return None


def resolve_factor(product: Dict[str, Any], from_unit: str, to_unit: str,
                   fixed_factors: Dict[str, float],
                   pair_rules: Optional[Dict[Any, Any]] = None) -> Optional[Dict[str, Any]]:
    """FASE B — faktor + **SUMBER** faktor (untuk jejak konversi D-07).

    Return `{factor, source, rule_id, formula, path[]}` atau None bila tak ada aturan.
    `source` ∈ same_unit | fixed_uom | product_override | global_rule | formula_gsm_width | hop_base
    """
    fu, tu = _norm(from_unit), _norm(to_unit)
    if fu == tu:
        return {"factor": 1.0, "source": "same_unit", "rule_id": "", "formula": "",
                "path": [f"{fu} = {tu}"]}
    direct = _fixed(fu, tu, fixed_factors)
    if direct is not None:
        return {"factor": direct, "source": "fixed_uom", "rule_id": "", "formula": "",
                "path": [f"master UOM: 1 {fu} = {direct:g} {tu}"]}
    var = _variable(product, fu, tu)
    if var is not None:
        return {"factor": var, "source": "product_override", "rule_id": "", "formula": "",
                "path": [f"master produk: 1 {fu} = {var:g} {tu}"]}
    glob = _pair(fu, tu, pair_rules)
    if glob is not None:
        return {"factor": glob["factor"], "source": "global_rule",
                "rule_id": glob.get("rule_id", ""), "formula": "",
                "path": [f"aturan global ({glob.get('kind')}): 1 {fu} = {glob['factor']:g} {tu}"]}
    cw = _catch_weight(product, fu, tu, fixed_factors)
    if cw is not None:
        return {"factor": cw, "source": "formula_gsm_width", "rule_id": "",
                "formula": "gsm_width",
                "path": [f"GSM × lebar: 1 {fu} = {cw:g} {tu} "
                         f"(kg per {_norm(product.get('base_unit', 'meter'))} = "
                         f"{kg_per_base_unit(product, fixed_factors):g})"]}
    hop = _resolve(product, fu, tu, fixed_factors, pair_rules)
    if hop is not None:
        base = _norm(product.get("base_unit", "meter"))
        return {"factor": hop, "source": "hop_base", "rule_id": "", "formula": "",
                "path": [f"{fu} → {base} → {tu}"]}
    return None


def convert(product: Dict[str, Any], qty: float, from_unit: str, to_unit: str,
            fixed_factors: Dict[str, float], precision: int = 2,
            pair_rules: Optional[Dict[Any, Any]] = None) -> float:
    """Konversi `qty` dari `from_unit` ke `to_unit`. Raise 400 bila faktor tak tersedia."""
    f = _resolve(product, _norm(from_unit), _norm(to_unit), fixed_factors, pair_rules)
    if f is None:
        raise HTTPException(status_code=400, detail=(
            f"Konversi unit '{from_unit}' → '{to_unit}' tidak tersedia untuk produk "
            f"{product.get('sku') or product.get('id')}. Tambahkan faktor di uom_conversions."
        ))
    return round(float(qty) * f, precision)


def to_base(product: Dict[str, Any], qty: float, unit: str,
            fixed_factors: Dict[str, float], precision: int = 2,
            pair_rules: Optional[Dict[Any, Any]] = None) -> float:
    """Konversi qty (dalam `unit`) ke BASE UNIT produk."""
    return convert(product, qty, unit, product.get("base_unit", "meter"), fixed_factors,
                   precision, pair_rules)


def from_base(product: Dict[str, Any], base_qty: float, unit: str,
              fixed_factors: Dict[str, float], precision: int = 2,
              pair_rules: Optional[Dict[Any, Any]] = None) -> float:
    """Konversi qty (dalam base unit) ke `unit` tampilan."""
    return convert(product, base_qty, product.get("base_unit", "meter"), unit, fixed_factors,
                   precision, pair_rules)


def resolve_roll_measures(product: Dict[str, Any], task_unit: str,
                          length_in: float, weight_in: float,
                          fixed_factors: Dict[str, float]) -> Dict[str, float]:
    """Fase 8 (Catch-weight) — resolusi ukuran SATU roll fisik saat Goods Receipt.

    Mengembalikan dict {length_base, weight_kg, task_qty}:
      - length_base : panjang roll dlm BASE unit produk (meter) → qty stok inventori.
      - weight_kg   : berat roll (kg) → catch-weight aktual yg disimpan di roll.
      - task_qty    : kontribusi roll thd qty diterima dlm SATUAN TASK (utk validasi Σ).

    Aturan (pilihan owner: faktor default per-produk + override AKTUAL saat GR):
      • task_unit == 'kg' (PO per berat):
          - weight = weight_in; length = length_in (meter aktual) bila diisi,
            else turunan weight/kgpm (butuh faktor). task_qty = weight.
      • task_unit panjang (meter/yard/…):
          - length_base = to_base(length_in); weight = weight_in (aktual) bila diisi,
            else estimasi length_base × kgpm (0 bila tak ada faktor). task_qty = length_in.
    """
    base = _norm(product.get("base_unit", "meter"))
    tu = _norm(task_unit) or base
    kgpm = kg_per_base_unit(product, fixed_factors)   # FASE B — kg per BASE unit
    L = float(length_in or 0)
    W = float(weight_in or 0)
    sku = product.get("sku") or product.get("id") or "?"

    if tu == "kg":
        if W <= 0 and L <= 0:
            raise HTTPException(status_code=400, detail=f"Roll {sku}: isi berat (kg) atau panjang (m).")
        weight = round(W if W > 0 else L * kgpm, 3)
        if L > 0:
            length_base = round(L, 2)
        else:
            if kgpm <= 0:
                raise HTTPException(status_code=400, detail=(
                    f"Roll {sku}: tak bisa menurunkan panjang dari berat — "
                    f"isi gramasi & lebar (atau kg_per_meter) produk, atau masukkan panjang aktual."))
            length_base = round(W / kgpm, 2)
        task_qty = weight
    else:
        if L <= 0:
            raise HTTPException(status_code=400, detail=f"Roll {sku}: panjang ({task_unit}) harus > 0.")
        length_base = to_base(product, L, task_unit, fixed_factors)
        weight = round(W if W > 0 else length_base * kgpm, 3)
        task_qty = round(L, 2)

    return {"length_base": length_base, "weight_kg": weight, "task_qty": round(task_qty, 3)}
