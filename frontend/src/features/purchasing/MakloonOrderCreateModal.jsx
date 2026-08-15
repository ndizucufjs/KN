/**
 * MakloonOrderCreateModal (M3) — buat order makloon (1 step konversi).
 * Pilih resep (auto-isi bahan/output/makloon/param) → qty + gudang → forecast → simpan.
 * Mode: process_only (bahan dari stok) | buy_process (spawn PO bahan).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, X, Save, Calculator, ArrowRight, GitBranch } from "lucide-react";
import axios, { API } from "../../services/apiClient";
import KNSelect from "../../components/KNSelect";
import ProductSelect from "../../components/ProductSelect";
import MakloonSelect, { PROCESS_LABELS } from "../../components/MakloonSelect";
import { formatQty } from "../../utils/formatters";
import { overlayDismiss } from "@/utils/overlayDismiss";

const PROC_OPTS = Object.entries(PROCESS_LABELS).map(([value, label]) => ({ value, label }));
const MODE_OPTS = [
  { value: "process_only", label: "Proses Saja (bahan dari stok)" },
  { value: "buy_process", label: "Beli + Proses (buat PO bahan)" },
];

export default function MakloonOrderCreateModal({ selectedEntity, initialMode, lockMode, onClose, onSaved, onError }) {
  const [recipes, setRecipes] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);

  const [f, setF] = useState({
    mode: initialMode || "process_only", recipe_id: "",
    material_product_id: "", material_name: "", material_qty: "", material_unit: "",
    from_warehouse_id: "", target_warehouse_id: "",
    supplier_id: "", supplier_name: "", material_price: "",
    process_type: "tenun", makloon_id: "", makloon_name: "",
    output_product_id: "", output_name: "", byproduct_product_id: "", byproduct_name: "",
    yield_factor: "1", waste_pct: "0", byproduct_pct: "0", tariff: "0", aux_cost: "0",
    notes: "",
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    (async () => {
      try {
        const [r, w, s] = await Promise.all([
          axios.get(`${API}/process-recipes`, { params: { status: "active" } }),
          axios.get(`${API}/warehouses`).catch(() => ({ data: [] })),
          axios.get(`${API}/suppliers`).catch(() => ({ data: [] })),
        ]);
        setRecipes(Array.isArray(r.data) ? r.data : []);
        const whs = Array.isArray(w.data) ? w.data : [];
        setWarehouses(whs);
        setSuppliers(Array.isArray(s.data) ? s.data : []);
        if (whs[0]) setF((p) => ({ ...p, from_warehouse_id: whs[0].id, target_warehouse_id: whs[0].id }));
      } catch (e) { onError?.(e.response?.data?.detail || "Gagal memuat data pendukung."); }
    })();
  }, []); // eslint-disable-line

  const applyRecipe = (rid) => {
    const r = recipes.find((x) => x.id === rid);
    if (!r) { setF((p) => ({ ...p, recipe_id: "" })); return; }
    setF((p) => ({
      ...p, recipe_id: rid, process_type: r.process_type || "tenun",
      material_product_id: r.input_product_id || "",
      material_name: r.input_sku ? `${r.input_sku}` : (p.material_name || ""),
      material_unit: r.input_unit || p.material_unit,
      output_product_id: r.output_product_id || "",
      output_name: r.output_sku || "",
      byproduct_product_id: r.byproduct_product_id || "",
      byproduct_name: r.byproduct_name ? `${r.byproduct_name}` : (r.byproduct_sku || ""),
      makloon_id: r.default_makloon_id || "", makloon_name: r.default_makloon_name || "",
      yield_factor: String(r.yield_factor ?? 1), waste_pct: String(r.waste_pct ?? 0),
      byproduct_pct: String(r.byproduct_pct ?? 0), tariff: String(r.default_tariff ?? 0),
      aux_cost: String(r.aux_cost_default ?? 0),
    }));
    setPreview(null);
  };

  const runForecast = useCallback(async () => {
    try {
      const res = await axios.post(`${API}/process-recipes/forecast`, {
        input_qty: parseFloat(f.material_qty) || 0, yield_factor: parseFloat(f.yield_factor) || 0,
        waste_pct: parseFloat(f.waste_pct) || 0, byproduct_pct: parseFloat(f.byproduct_pct) || 0,
      });
      setPreview(res.data);
    } catch (e) { onError?.(e.response?.data?.detail || "Gagal menghitung forecast."); }
  }, [f.material_qty, f.yield_factor, f.waste_pct, f.byproduct_pct]); // eslint-disable-line

  const whOpts = useMemo(() => warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` })), [warehouses]);
  const supOpts = useMemo(() => [{ value: "", label: "— Pilih supplier —" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))], [suppliers]);
  const recipeOpts = useMemo(() => [{ value: "", label: "— Pilih resep (opsional) —" }, ...recipes.map((r) => ({ value: r.id, label: r.name }))], [recipes]);

  const save = async () => {
    if (!f.material_product_id) { onError?.("Produk bahan wajib dipilih."); return; }
    if (!(parseFloat(f.material_qty) > 0)) { onError?.("Qty bahan harus > 0."); return; }
    if (!f.output_product_id) { onError?.("Produk output wajib dipilih."); return; }
    if (!f.makloon_id) { onError?.("Mitra makloon wajib dipilih."); return; }
    if (!f.from_warehouse_id) { onError?.("Gudang sumber bahan wajib dipilih."); return; }
    if (f.mode === "buy_process" && !f.supplier_id) { onError?.("Supplier bahan wajib dipilih untuk mode Beli + Proses."); return; }
    setSaving(true);
    const supplier = suppliers.find((s) => s.id === f.supplier_id);
    const payload = {
      mode: f.mode, material_product_id: f.material_product_id,
      material_qty: parseFloat(f.material_qty) || 0, material_unit: f.material_unit,
      from_warehouse_id: f.from_warehouse_id, target_warehouse_id: f.target_warehouse_id || f.from_warehouse_id,
      supplier_id: f.supplier_id, supplier_name: supplier?.name || "", material_price: parseFloat(f.material_price) || 0,
      notes: f.notes,
      entity_id: selectedEntity && selectedEntity !== "all" ? selectedEntity : "",
      steps: [{
        process_type: f.process_type, makloon_id: f.makloon_id, recipe_id: f.recipe_id,
        input_product_id: f.material_product_id, output_product_id: f.output_product_id,
        byproduct_product_id: f.byproduct_product_id,
        yield_factor: parseFloat(f.yield_factor) || 0, waste_pct: parseFloat(f.waste_pct) || 0,
        byproduct_pct: parseFloat(f.byproduct_pct) || 0,
        tariff: parseFloat(f.tariff) || 0, aux_cost: parseFloat(f.aux_cost) || 0,
      }],
    };
    try {
      const res = await axios.post(`${API}/makloon-orders`, payload);
      onSaved?.(res.data);
    } catch (e) { onError?.(e.response?.data?.detail || "Gagal membuat order makloon."); setSaving(false); }
  };

  return (
    <div data-testid="makloon-order-create-modal" className="fixed inset-0 z-[160] flex items-center justify-center bg-black/50 p-4" {...overlayDismiss(onClose)}>
      <div className="flex max-h-[92vh] w-full max-w-[720px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#EFF0F2] px-4 py-3">
          <h2 className="flex items-center gap-2 text-[15px] font-bold"><Boxes size={16} className="text-[#0058CC]" /> {lockMode ? (f.mode === "buy_process" ? "Buat PO — Raw Material & Proses" : "Buat PO — Proses Saja") : "Buat Order Makloon"}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Tutup"><X size={18} /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {lockMode ? (
            <div className="rounded-lg border border-[#DCEAFE] bg-[#F2F7FF] p-2.5">
              <p className="text-[10px] font-bold uppercase text-[#0058CC]">Mode Pengadaan</p>
              <p className="text-[12.5px] font-semibold text-[#1B2733]">{f.mode === "buy_process" ? "Raw Material & Proses — beli bahan + kirim ke makloon" : "Proses Saja — bahan dari stok, kirim ke makloon"}</p>
            </div>
          ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mode Pengadaan"><KNSelect data-testid="mko-mode" className="field" value={f.mode} onValueChange={(v) => setF((p) => ({ ...p, mode: v }))} options={MODE_OPTS} /></Field>
            <Field label="Dari Resep (auto-isi)"><KNSelect data-testid="mko-recipe" className="field" value={f.recipe_id} onValueChange={applyRecipe} options={recipeOpts} /></Field>
          </div>
          )}
          {lockMode && (
            <Field label="Dari Resep (auto-isi)"><KNSelect data-testid="mko-recipe" className="field" value={f.recipe_id} onValueChange={applyRecipe} options={recipeOpts} /></Field>
          )}

          {f.mode === "buy_process" && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-[#EFD9A8] bg-[#FFFBEF] p-3">
              <Field label="Supplier Bahan" req><KNSelect data-testid="mko-supplier" className="field" value={f.supplier_id} onValueChange={(v) => setF((p) => ({ ...p, supplier_id: v }))} options={supOpts} /></Field>
              <Field label="Harga Bahan / unit (Rp)"><input data-testid="mko-material-price" type="number" className="field" value={f.material_price} onChange={set("material_price")} placeholder="mis. 51500" /></Field>
            </div>
          )}

          <div className="rounded-lg border border-[#EFF0F2] bg-[#FAFBFC] p-3">
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase text-[#6B6B73]">Bahan (Input)</p>
                <ProductSelect triggerTestId="mko-material-product" value={f.material_product_id} valueName={f.material_name}
                  onSelect={(p) => setF((prev) => ({ ...prev, material_product_id: p.id, material_name: `${p.name} (${p.sku})`, material_unit: p.base_unit }))} label="Pilih bahan…" />
              </div>
              <ArrowRight size={18} className="mb-2 text-[#0058CC]" />
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase text-[#6B6B73]">Output</p>
                <ProductSelect triggerTestId="mko-output-product" value={f.output_product_id} valueName={f.output_name}
                  onSelect={(p) => setF((prev) => ({ ...prev, output_product_id: p.id, output_name: `${p.name} (${p.sku})` }))} label="Pilih output…" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Qty Bahan" req><input data-testid="mko-material-qty" type="number" className="field" value={f.material_qty} onChange={set("material_qty")} placeholder="mis. 50" /></Field>
            <Field label="Satuan"><input data-testid="mko-material-unit" className="field" value={f.material_unit} onChange={set("material_unit")} placeholder="kg" /></Field>
            <Field label="Jenis Proses"><KNSelect data-testid="mko-process-type" className="field" value={f.process_type} onValueChange={(v) => setF((p) => ({ ...p, process_type: v }))} options={PROC_OPTS} /></Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Gudang Sumber Bahan" req><KNSelect data-testid="mko-from-warehouse" className="field" value={f.from_warehouse_id} onValueChange={(v) => setF((p) => ({ ...p, from_warehouse_id: v }))} options={whOpts} /></Field>
            <Field label="Mitra Makloon" req>
              <MakloonSelect triggerTestId="mko-makloon" processType={f.process_type} value={f.makloon_id} valueName={f.makloon_name}
                onSelect={(m) => setF((p) => ({ ...p, makloon_id: m.id, makloon_name: m.name }))} label="Pilih makloon…" />
            </Field>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <Field label="Yield (out/in)"><input data-testid="mko-yield" type="number" step="0.01" className="field" value={f.yield_factor} onChange={set("yield_factor")} /></Field>
            <Field label="Waste (%)"><input data-testid="mko-waste" type="number" step="0.1" className="field" value={f.waste_pct} onChange={set("waste_pct")} /></Field>
            <Field label="Sisa (%)"><input data-testid="mko-byproduct" type="number" step="0.1" className="field" value={f.byproduct_pct} onChange={set("byproduct_pct")} /></Field>
            <Field label="Tarif/unit (Rp)"><input data-testid="mko-tariff" type="number" className="field" value={f.tariff} onChange={set("tariff")} /></Field>
          </div>

          <div className="rounded-lg border border-[#EFE0C8] bg-[#FFFBF3] p-3">
            <p className="mb-1 text-[10px] font-bold uppercase text-[#9A6B1E]">Barang Sisa (leftover bahan input yang dikembalikan makloon, diterima sbg produk tersendiri)</p>
            <ProductSelect triggerTestId="mko-byproduct-product" value={f.byproduct_product_id} valueName={f.byproduct_name}
              onSelect={(p) => setF((prev) => ({ ...prev, byproduct_product_id: p.id, byproduct_name: `${p.name} (${p.sku})` }))} label="Pilih produk barang sisa (mis. Benang/Grey Sisa)…" />
            <p className="mt-1 text-[10px] text-[#9A9BA3]">Kosongkan bila tak ada sisa. Sisa dinilai pada HPP bahan & mengurangi HPP output.</p>
          </div>

          <div className="rounded-lg border border-dashed border-[#0058CC]/40 bg-[#EAF2FF]/40 p-3">
            <div className="flex items-center gap-2">
              <button data-testid="mko-forecast-btn" type="button" className="secondary-button" onClick={runForecast}><Calculator size={13} /> Hitung Estimasi Hasil</button>
              {preview && (
                <div className="flex-1 text-[11.5px]" data-testid="mko-forecast-result">
                  Output ≈ <b className="tabular-nums text-[#0058CC]">{formatQty(preview.expected_output)}</b> · Barang Sisa ≈ <b className="tabular-nums">{formatQty(preview.expected_byproduct)}</b>
                </div>
              )}
            </div>
          </div>

          <Field label="Catatan"><textarea data-testid="mko-notes" className="field" rows="2" value={f.notes} onChange={set("notes")} placeholder="Instruksi khusus…" /></Field>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-[#EFF0F2] px-4 py-3">
          <p className="flex items-center gap-1.5 text-[11px] text-[#6B6B73]"><GitBranch size={12} /> Pesanan tersimpan sebagai <b>Draf</b> — lalu Issue & Terima di detail.</p>
          <div className="flex gap-2">
            <button className="secondary-button" onClick={onClose}>Batal</button>
            <button data-testid="mko-form-save" className="primary-button" disabled={saving} onClick={save}><Save size={14} /> {saving ? "Menyimpan…" : "Simpan Order"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, req, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-semibold text-[#6B6B73]">{label} {req && <span className="text-[#D14343]">*</span>}</span>
      {children}
    </label>
  );
}
