/**
 * MakloonWizard (FASE D · PS-04) — Wizard Order Makloon MULTI-TAHAP & MULTI-MITRA.
 *
 * 3 tahap: (1) Bahan & gudang → (2) Rantai proses (langkah bebas, mitra berbeda) →
 * (3) Ringkasan biaya berjenjang + simpan.
 * Rantai DIPAKSA sistem: bahan langkah N+1 = hasil langkah N (tidak bisa diketik bebas).
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Boxes, Check, Plus, Save, TriangleAlert, X } from "lucide-react";
import axios, { API } from "../../../services/apiClient";
import KNSelect from "../../../components/KNSelect";
import ProductSelect from "../../../components/ProductSelect";
import { formatCurrency, formatQty } from "../../../utils/formatters";
import MakloonStepEditor from "./MakloonStepEditor";
import { fetchEnum, FALLBACK_BASIS_LABELS } from "./makloonApi";
import { overlayDismiss } from "@/utils/overlayDismiss";

const MODE_OPTS = [
  { value: "process_only", label: "Proses Saja (bahan dari stok)" },
  { value: "buy_process", label: "Beli + Proses (buat PO bahan)" },
];

const emptyStep = () => ({
  process_type: "tenun", makloon_id: "", makloon_name: "", output_product_id: "",
  output_name: "", output_unit: "", byproduct_product_id: "", byproduct_name: "",
  input_qty: "", waste_pct: "", tolerance_pct: "", byproduct_pct: "",
  tariff_basis: "", tariff_rate: "", tariff_formula: "", ppi: "", colors: "", repeats: "",
  yield_factor: "", yield_override_reason: "", aux_fees: [],
});

export default function MakloonWizard({ selectedEntity, onClose, onSaved, onError,
                                       prefill = null, prContext = null }) {
  const [stage, setStage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [warehouses, setWarehouses] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [processOptions, setProcessOptions] = useState([]);
  const [basisOptions, setBasisOptions] = useState([]);
  const [err, setErr] = useState("");

  const [head, setHead] = useState({
    mode: "process_only", material_product_id: "", material_name: "", material_unit: "",
    material_qty: "", from_warehouse_id: "", target_warehouse_id: "",
    supplier_id: "", supplier_name: "", material_price: "", notes: "",
  });
  const [steps, setSteps] = useState([emptyStep()]);
  const [materialProduct, setMaterialProduct] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [w, s, pe, be] = await Promise.all([
          axios.get(`${API}/warehouses`).catch(() => ({ data: [] })),
          axios.get(`${API}/suppliers`).catch(() => ({ data: [] })),
          fetchEnum("process_type").catch(() => null),
          fetchEnum("tariff_basis").catch(() => null),
        ]);
        const whs = Array.isArray(w.data) ? w.data : [];
        setWarehouses(whs);
        setSuppliers(Array.isArray(s.data) ? s.data : []);
        setProcessOptions((pe?.values || []).map((v) => ({ value: v.value, label: v.label })));
        setBasisOptions((be?.values || Object.keys(FALLBACK_BASIS_LABELS).map((k) => ({ value: k, label: FALLBACK_BASIS_LABELS[k] })))
          .map((v) => ({ value: v.value, label: v.label })));
        if (whs[0]) setHead((p) => ({ ...p, from_warehouse_id: whs[0].id, target_warehouse_id: whs[0].id }));
      } catch (e) { onError?.("Gagal memuat data pendukung wizard."); }
    })();
  }, []); // eslint-disable-line

  // FASE E — prefill dari baris PR (1 klik): bahan/mitra/kontrak/qty diturunkan
  // dari Resep Proses oleh backend, lalu user masih bisa mengubah di wizard.
  useEffect(() => {
    const p = prefill?.payload;
    if (!p) return;
    setHead((prev) => ({
      ...prev,
      mode: p.mode || "process_only",
      material_product_id: p.material_product_id || "",
      material_name: p.material_name || "",
      material_unit: p.material_unit || "",
      material_qty: p.material_qty != null ? String(p.material_qty) : "",
      from_warehouse_id: p.from_warehouse_id || prev.from_warehouse_id,
      target_warehouse_id: p.target_warehouse_id || p.from_warehouse_id || prev.target_warehouse_id,
      notes: p.notes || prev.notes,
    }));
    if (p.material_product_id) {
      setMaterialProduct({
        id: p.material_product_id, sku: p.material_sku || "",
        name: p.material_name || "", base_unit: p.material_unit || "",
      });
    }
    if ((p.steps || []).length) {
      setSteps(p.steps.map((s) => ({
        ...emptyStep(),
        process_type: s.process_type || "tenun",
        makloon_id: s.makloon_id || "",
        makloon_name: s.makloon_name || "",
        recipe_id: s.recipe_id || "",
        contract_id: s.contract_id || "",
        output_product_id: s.output_product_id || "",
        // Nama & satuan hasil WAJIB dipetakan, kalau tidak kolom "Produk Hasil"
        // tampak kosong dan ringkasan rantai menampilkan "?" meski data sudah benar.
        output_name: s.output_name || "",
        output_unit: s.output_unit || "",
        byproduct_product_id: s.byproduct_product_id || "",
        byproduct_name: s.byproduct_name || "",
      })));
    }
  }, [prefill]); // eslint-disable-line

  // Rantai: input langkah N+1 = output langkah N (dipaksa sistem)
  useEffect(() => {
    setSteps((prev) => prev.map((s, i) => (i === 0
      ? { ...s, input_qty: head.material_qty }
      : { ...s, input_qty: prev[i - 1]?._preview?.estimate?.expected_output_qty ?? s.input_qty })));
  }, [head.material_qty, steps.length, JSON.stringify(steps.map((s) => s._preview?.estimate?.expected_output_qty))]); // eslint-disable-line

  const inputProductFor = (i) => {
    if (i === 0) return materialProduct;
    const prev = steps[i - 1];
    return prev?.output_product_id
      ? { id: prev.output_product_id, name: prev.output_name, base_unit: prev.output_unit }
      : null;
  };

  const whOpts = useMemo(() => warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` })), [warehouses]);
  const supOpts = useMemo(
    () => [{ value: "", label: "— Pilih supplier —" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))],
    [suppliers]);

  const plannedService = steps.reduce((a, s) => a + (s._preview?.tariff?.amount || 0), 0);
  const finalStep = steps[steps.length - 1];
  const finalQty = finalStep?._preview?.estimate?.expected_output_qty || 0;
  const partners = new Set(steps.map((s) => s.makloon_id).filter(Boolean));

  const validateStage1 = () => {
    if (!head.material_product_id) return "Produk bahan wajib dipilih.";
    if (!(parseFloat(head.material_qty) > 0)) return "Qty bahan harus lebih dari 0.";
    if (!head.from_warehouse_id) return "Gudang sumber bahan wajib dipilih.";
    if (head.mode === "buy_process" && !head.supplier_id) return "Supplier bahan wajib dipilih untuk mode Beli + Proses.";
    return "";
  };
  const validateStage2 = () => {
    for (let i = 0; i < steps.length; i += 1) {
      const s = steps[i];
      if (!s.makloon_id) return `Langkah ${i + 1}: mitra makloon wajib dipilih.`;
      if (!s.output_product_id) return `Langkah ${i + 1}: produk hasil (output) wajib dipilih.`;
      if (parseFloat(s.yield_factor) > 0 && !(s.yield_override_reason || "").trim()) {
        return `Langkah ${i + 1}: override yield wajib disertai alasan (bisa diaudit).`;
      }
    }
    return "";
  };

  const next = () => {
    const msg = stage === 1 ? validateStage1() : validateStage2();
    if (msg) { setErr(msg); return; }
    setErr("");
    setStage((v) => v + 1);
  };

  const save = async () => {
    const msg = validateStage1() || validateStage2();
    if (msg) { setErr(msg); setStage(msg.startsWith("Langkah") ? 2 : 1); return; }
    setSaving(true);
    setErr("");
    const payload = {
      mode: head.mode,
      material_product_id: head.material_product_id,
      material_qty: parseFloat(head.material_qty) || 0,
      material_unit: head.material_unit,
      from_warehouse_id: head.from_warehouse_id,
      target_warehouse_id: head.target_warehouse_id || head.from_warehouse_id,
      supplier_id: head.supplier_id, supplier_name: head.supplier_name,
      material_price: parseFloat(head.material_price) || 0,
      notes: head.notes,
      entity_id: selectedEntity && selectedEntity !== "all" ? selectedEntity : "",
      steps: steps.map((s, i) => {
        const out = {
          process_type: s.process_type,
          makloon_id: s.makloon_id,
          recipe_id: s.recipe_id || "",
          contract_id: s.contract_id || "",
          input_product_id: i === 0 ? head.material_product_id : steps[i - 1].output_product_id,
          output_product_id: s.output_product_id,
          byproduct_product_id: s.byproduct_product_id || "",
          byproduct_pct: parseFloat(s.byproduct_pct) || 0,
          colors: parseInt(s.colors, 10) || 0,
          repeats: parseInt(s.repeats, 10) || 0,
        };
        if (s.waste_pct !== "" && s.waste_pct != null) out.waste_pct = parseFloat(s.waste_pct);
        if (s.tolerance_pct !== "" && s.tolerance_pct != null) out.tolerance_pct = parseFloat(s.tolerance_pct);
        if (s.tariff_basis) out.tariff_basis = s.tariff_basis;
        if (s.tariff_rate !== "" && s.tariff_rate != null) out.tariff_rate = parseFloat(s.tariff_rate);
        if (s.tariff_formula) out.tariff_formula = s.tariff_formula;
        if (s.ppi !== "" && s.ppi != null) out.ppi = parseFloat(s.ppi);
        if (parseFloat(s.yield_factor) > 0) {
          out.yield_factor = parseFloat(s.yield_factor);
          out.yield_override_reason = s.yield_override_reason;
        }
        if ((s.aux_fees || []).length) {
          out.aux_fees = s.aux_fees
            .filter((f) => parseFloat(f.amount) > 0)
            .map((f) => ({ code: f.code || f.label || "biaya", label: f.label || f.code || "Biaya",
                           basis: f.basis || "lumpsum", amount: parseFloat(f.amount) || 0 }));
        }
        return out;
      }),
    };
    try {
      // FASE E — bila wizard dibuka dari baris PR, order dibuat lewat endpoint realisasi
      // agar jejak kebutuhan → realisasi (PR ↔ Order Makloon) tercatat otomatis.
      const res = prContext?.pr_id
        ? await axios.post(`${API}/purchase-requisitions/${prContext.pr_id}/realize-makloon`,
                           { line_no: prContext.line_no, payload })
        : await axios.post(`${API}/makloon-orders`, payload);
      onSaved?.(prContext?.pr_id ? res.data.makloon_order : res.data);
    } catch (e) {
      const detail = e.response?.data?.detail || "Gagal membuat order makloon.";
      setErr(typeof detail === "string" ? detail : JSON.stringify(detail));
      setSaving(false);
    }
  };

  return (
    <div data-testid="makloon-wizard" className="fixed inset-0 z-[170] flex items-center justify-center bg-black/50 p-4" {...overlayDismiss(onClose)}>
      <div className="flex max-h-[94vh] w-full max-w-[980px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#EFF0F2] px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-bold"><Boxes size={16} className="text-[#0058CC]" /> Wizard Order Makloon</h2>
            <p className="text-[11px] text-[#6B6B73]">
              {prContext?.pr_number
                ? `Realisasi ${prContext.pr_number} baris ${prContext.line_no} · bahan & mitra ter-prefill dari Resep Proses`
                : "Rantai proses multi-tahap & multi-mitra · estimasi berbasis GSM · tarif dari kontrak"}
            </p>
          </div>
          <button className="icon-button" onClick={onClose} data-testid="wizard-close"><X size={18} /></button>
        </div>

        <div className="flex items-center gap-2 border-b border-[#EFF0F2] bg-[#FAFBFC] px-4 py-2" data-testid="wizard-stages">
          {["Bahan & Gudang", "Rantai Proses", "Ringkasan & Simpan"].map((t, i) => (
            <div key={t} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${stage === i + 1 ? "bg-[#0058CC] text-white" : stage > i + 1 ? "bg-[#E6F4EA] text-[#1B7F4B]" : "bg-white text-[#9A9BA3] border border-[#E5E5EA]"}`}>
              {stage > i + 1 ? <Check size={11} /> : <span>{i + 1}</span>} {t}
            </div>
          ))}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {err && (
            <div data-testid="wizard-error" className="rounded-lg bg-[#FDEDE7] px-3 py-2 text-[11.5px] text-[#C0392B]">
              <TriangleAlert size={12} className="mr-1 inline" />{err}
            </div>
          )}

          {stage === 1 && (
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Mode Pesanan">
                <KNSelect data-testid="wizard-mode" className="field" value={head.mode}
                  onValueChange={(v) => setHead((p) => ({ ...p, mode: v }))} options={MODE_OPTS} />
              </Field>
              <Field label="Produk Bahan (input awal)">
                <ProductSelect value={head.material_product_id} valueName={head.material_name}
                  triggerTestId="wizard-material"
                  onSelect={(p) => {
                    setMaterialProduct(p);
                    setHead((h) => ({ ...h, material_product_id: p.id, material_name: p.name, material_unit: p.base_unit }));
                  }} />
              </Field>
              <Field label={`Qty Bahan (${head.material_unit || "unit"})`}>
                <input data-testid="wizard-material-qty" className="field" value={head.material_qty}
                  onChange={(e) => setHead((p) => ({ ...p, material_qty: e.target.value }))} placeholder="mis. 200" />
              </Field>
              <Field label="Gudang Sumber Bahan">
                <KNSelect data-testid="wizard-from-wh" className="field" value={head.from_warehouse_id}
                  onValueChange={(v) => setHead((p) => ({ ...p, from_warehouse_id: v }))} options={whOpts} />
              </Field>
              <Field label="Gudang Tujuan Hasil">
                <KNSelect data-testid="wizard-target-wh" className="field" value={head.target_warehouse_id}
                  onValueChange={(v) => setHead((p) => ({ ...p, target_warehouse_id: v }))} options={whOpts} />
              </Field>
              {head.mode === "buy_process" && (
                <>
                  <Field label="Supplier Bahan">
                    <KNSelect data-testid="wizard-supplier" className="field" value={head.supplier_id}
                      onValueChange={(v) => setHead((p) => ({ ...p, supplier_id: v, supplier_name: suppliers.find((s) => s.id === v)?.name || "" }))}
                      options={supOpts} />
                  </Field>
                  <Field label="Harga Beli Bahan (Rp/unit)">
                    <input data-testid="wizard-material-price" className="field" value={head.material_price}
                      onChange={(e) => setHead((p) => ({ ...p, material_price: e.target.value }))} />
                  </Field>
                </>
              )}
              <div className="md:col-span-2">
                <Field label="Catatan">
                  <input data-testid="wizard-notes" className="field" value={head.notes}
                    onChange={(e) => setHead((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="mis. produksi kain printing motif A untuk SO-0007" />
                </Field>
              </div>
            </div>
          )}

          {stage === 2 && (
            <div className="space-y-3">
              {steps.map((s, i) => (
                <MakloonStepEditor key={i} index={i} step={s} inputProduct={inputProductFor(i)}
                  processOptions={processOptions} basisOptions={basisOptions} entityId={selectedEntity}
                  canRemove={steps.length > 1}
                  onChange={(ns) => setSteps((p) => p.map((x, idx) => (idx === i ? ns : x)))}
                  onRemove={() => setSteps((p) => p.filter((_, idx) => idx !== i))} />
              ))}
              <button type="button" data-testid="wizard-add-step" className="secondary-button w-full justify-center"
                onClick={() => setSteps((p) => [...p, emptyStep()])}>
                <Plus size={13} /> Tambah Langkah Proses (mitra boleh berbeda)
              </button>
            </div>
          )}

          {stage === 3 && (
            <div className="space-y-3" data-testid="wizard-summary">
              <div className="section-card">
                <div className="section-head"><h3 className="text-[12.5px] font-bold">Rantai proses</h3></div>
                <div className="section-body space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
                    <span className="rounded bg-[#F3F4F6] px-2 py-1 font-semibold">{head.material_name} · {formatQty(parseFloat(head.material_qty) || 0)} {head.material_unit}</span>
                    {steps.map((s, i) => (
                      <span key={i} className="flex items-center gap-1.5">
                        <ArrowRight size={12} className="text-[#9A9BA3]" />
                        <span className="rounded bg-[#EAF2FF] px-2 py-1 font-semibold text-[#0058CC]">
                          {s.output_name || "?"} · {formatQty(s._preview?.estimate?.expected_output_qty || 0)} {s.output_unit}
                          <span className="ml-1 text-[10px] font-normal text-[#6B6B73]">({s.makloon_name})</span>
                        </span>
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <Kpi label="Jumlah langkah" value={String(steps.length)} />
                    <Kpi label="Mitra terlibat" value={String(partners.size)} />
                    <Kpi label="Perkiraan hasil akhir" value={`${formatQty(finalQty)} ${finalStep?.output_unit || ""}`} tone="#0058CC" />
                    <Kpi label="Rencana ongkos jasa" value={formatCurrency(plannedService)} tone="#1B7F4B" />
                  </div>
                </div>
              </div>
              <div className="section-card">
                <div className="section-head"><h3 className="text-[12.5px] font-bold">Rincian biaya per langkah (rencana)</h3></div>
                <div className="section-body">
                  <table className="w-full text-[11.5px]">
                    <thead>
                      <tr className="text-left text-[10px] uppercase text-[#6B6B73]">
                        <th className="py-1">Langkah</th><th>Mitra</th><th>Basis tarif</th>
                        <th className="text-right">Perkiraan hasil</th><th className="text-right">Ongkos jasa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFF0F2]">
                      {steps.map((s, i) => (
                        <tr key={i} data-testid={`wizard-summary-row-${i + 1}`}>
                          <td className="py-1.5">{i + 1}. {s.process_type}</td>
                          <td>{s.makloon_name || "—"}</td>
                          <td>{FALLBACK_BASIS_LABELS[s._preview?.tariff?.basis] || s._preview?.tariff?.basis || "—"}</td>
                          <td className="text-right tabular-nums">{formatQty(s._preview?.estimate?.expected_output_qty || 0)} {s.output_unit}</td>
                          <td className="text-right tabular-nums">{formatCurrency(s._preview?.tariff?.amount || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[#EFF0F2] px-4 py-3">
          <button className="secondary-button" onClick={stage === 1 ? onClose : () => setStage((v) => v - 1)} data-testid="wizard-back">
            <ArrowLeft size={13} /> {stage === 1 ? "Batal" : "Kembali"}
          </button>
          {stage < 3 ? (
            <button className="primary-button" onClick={next} data-testid="wizard-next">
              Lanjut <ArrowRight size={13} />
            </button>
          ) : (
            <button className="primary-button" onClick={save} disabled={saving} data-testid="wizard-save">
              <Save size={13} /> {saving ? "Menyimpan…" : "Simpan Order Makloon"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-semibold text-[#6B6B73]">{label}</span>
      {children}
    </label>
  );
}
function Kpi({ label, value, tone = "#1C1C1E" }) {
  return (
    <div className="rounded-lg border border-[#EFF0F2] bg-[#FAFBFC] p-2">
      <p className="text-[9.5px] font-bold uppercase text-[#8E8E93]">{label}</p>
      <p className="text-[13.5px] font-bold tabular-nums leading-tight" style={{ color: tone }}>{value}</p>
    </div>
  );
}
