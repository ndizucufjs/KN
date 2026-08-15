/**
 * entityLabel — SATU tempat menerjemahkan dokumen entitas (PT) menjadi teks
 * yang layak dibaca manusia.
 *
 * MASALAH NYATA (terlihat di layar, 2026-07-29): sebagian layar memakai
 * `entity.name` padahal `GET /api/entities` mengembalikan `legal_name` &
 * `short_name` (TIDAK ada `name`, TIDAK ada `code` — itu hanya ada di
 * `entity_context.entities` saat login). Akibatnya:
 *
 *   · POS → panel Filter → "Entitas" menampilkan **`ent_ksc`** (id teknis);
 *   · Pengaturan → pemilih entitas menampilkan **`ent_ksc`**;
 *   · Insentif CRM → kolom entitas menampilkan **`ent_ksc`**;
 *   · Payroll → pilihan entitas **KOSONG** (label `undefined`).
 *
 * Aturan modul ini: **JANGAN PERNAH** menampilkan `entity.id` ke pengguna.
 * Kalau nama benar-benar tidak diketahui, pakai kata Indonesia yang jujur
 * ("Entitas aktif" / "Semua Entitas"), bukan id mentah.
 */

const ALL_LABEL = "Semua Entitas";
const UNKNOWN_LABEL = "Entitas aktif";

/** Nama PENDEK untuk badge/pil (mis. "KSC"). */
export function entityShort(entity, fallback = UNKNOWN_LABEL) {
  if (!entity) return fallback;
  return entity.short_name || entity.code || entity.doc_prefix
    || entity.name || entity.legal_name || fallback;
}

/** Nama PENUH untuk dropdown & judul (mis. "PT Kain Suka Cita"). */
export function entityFull(entity, fallback = UNKNOWN_LABEL) {
  if (!entity) return fallback;
  return entity.legal_name || entity.name || entity.short_name
    || entity.code || entity.doc_prefix || fallback;
}

/** Cari entitas di daftar lalu ambil nama pendeknya. `all`/kosong → "Semua Entitas". */
export function entityShortById(entities, id, fallback = UNKNOWN_LABEL) {
  if (!id || id === "all") return ALL_LABEL;
  return entityShort((entities || []).find((e) => e && e.id === id), fallback);
}

/** Cari entitas di daftar lalu ambil nama penuhnya. `all`/kosong → "Semua Entitas". */
export function entityFullById(entities, id, fallback = UNKNOWN_LABEL) {
  if (!id || id === "all") return ALL_LABEL;
  return entityFull((entities || []).find((e) => e && e.id === id), fallback);
}

/** Opsi KNSelect/dropdown standar: `all` + seluruh entitas (nama penuh). */
export function entityOptions(entities, { withAll = false, short = false } = {}) {
  const list = (entities || []).filter(Boolean).map((e) => ({
    value: e.id,
    label: short ? entityShort(e) : entityFull(e),
  }));
  return withAll ? [{ value: "all", label: ALL_LABEL }, ...list] : list;
}

export const ENTITY_ALL_LABEL = ALL_LABEL;

/**
 * Keterangan cakupan untuk EMPTY STATE (FASE E-3 — konsistensi lintas layar).
 *
 * "Belum ada data" itu ambigu di aplikasi multi-badan-usaha: pengguna tidak tahu
 * apakah datanya memang tidak ada, atau ia sedang melihat badan usaha yang salah.
 * Dipakai begini:  `Belum ada pesanan ${scopeSuffix(entities, selectedEntity)}.`
 *   → "Belum ada pesanan untuk CV Kanda Suka."
 *   → "Belum ada pesanan di seluruh badan usaha."
 */
export function scopeSuffix(entities, id) {
  if (!id || id === "all") return "di seluruh badan usaha";
  return `untuk ${entityFull((entities || []).find((e) => e && e.id === id))}`;
}
