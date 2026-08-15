/**
 * Sub-fase 1.13 — util konversi UOM sisi frontend (DISPLAY/preview saja).
 * Sumber kebenaran tetap backend (services/uom_service.py). Faktor FIXED disamakan.
 */
export const FIXED_LENGTH_FACTORS = { meter: 1, m: 1, yard: 0.9144, yd: 0.9144, cm: 0.01, inch: 0.0254, in: 0.0254 };

const norm = (u) => String(u || "").trim().toLowerCase();
const round2 = (n) => Math.round(n * 100) / 100;

/** Faktor meter per 1 unit (tanpa pembulatan). null bila tak diketahui. */
export function convFactor(product, unit) {
  const base = norm(product?.base_unit || "meter");
  const u = norm(unit || base);
  if (u === base) return 1;
  const ff = FIXED_LENGTH_FACTORS;
  if (ff[u] != null && ff[base] != null) return ff[u] / ff[base];
  for (const c of product?.uom_conversions || []) {
    const cf = norm(c.from_unit), ct = norm(c.to_unit), fac = Number(c.factor);
    if (!fac) continue;
    if (cf === u && ct === base) return fac;
    if (ct === u && cf === base) return 1 / fac;
  }
  // Sub-fase 1.13 / FASE B — catch-weight kg → base: 1 kg = 1 / kg-per-BASE-unit.
  // WAJIB memakai kg per BASE unit (bukan per meter) agar produk berbasis yard tidak
  // salah ±9,4% — selaras `uom_service.kg_per_base_unit()`.
  const kgPerBase = kgPerBaseUnit(product);
  if (kgPerBase > 0 && u === "kg") return 1 / kgPerBase;
  return null;
}

/**
 * FASE B/C — berat (kg) per 1 **BASE UNIT produk** (cermin `uom_service.kg_per_base_unit`).
 *
 * `gramasi × lebar ÷ 1000` menghasilkan kg per **METER**. Bila base unit produk bukan
 * meter (mis. **yard**), nilai itu WAJIB dikalikan meter-per-base-unit (1 yard =
 * 0,9144 m); tanpa itu berat prefill di form GR/PO salah ~9,4% dan server menolak
 * penerimaan karena selisih konversi melebihi toleransi.
 */
export function kgPerBaseUnit(product) {
  const explicit = Number(product?.kg_per_meter) || 0;
  const gsm = Number(product?.gramasi) || 0;
  const width = Number(product?.lebar) || 0;
  const kgPerMeter = explicit > 0 ? explicit : (gsm * width) / 1000;
  if (!(kgPerMeter > 0)) return 0;
  const base = norm(product?.base_unit || "meter");
  if (["meter", "m", "mtr", "kg", ""].includes(base)) return kgPerMeter;
  const mPerBase = FIXED_LENGTH_FACTORS[base];
  if (!mPerBase || mPerBase <= 0) return kgPerMeter;   // base non-panjang (roll/pcs)
  return kgPerMeter * mPerBase;
}

/** Konversi qty (unit) → base unit produk. null bila tak diketahui. */
export function toBase(product, qty, unit) {
  const f = convFactor(product, unit);
  return f == null ? null : round2((Number(qty) || 0) * f);
}

/** Daftar unit yang valid untuk produk: base + length FIXED + unit dari uom_conversions. */
export function unitOptions(product) {
  const base = norm(product?.base_unit || "meter");
  const seen = new Set([base, "yard", "cm", "inch"]);
  (product?.uom_conversions || []).forEach((c) => {
    if (c.from_unit) seen.add(norm(c.from_unit));
    if (c.to_unit) seen.add(norm(c.to_unit));
  });
  // Sub-fase 1.13 — kg tersedia bila gramasi & lebar terisi (catch-weight)
  if ((Number(product?.gramasi) || 0) > 0 && (Number(product?.lebar) || 0) > 0) seen.add("kg");
  return Array.from(seen).map((u) => ({ value: u, label: u.charAt(0).toUpperCase() + u.slice(1) }));
}
