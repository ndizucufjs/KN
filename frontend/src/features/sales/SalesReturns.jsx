/**
 * Sub-fase 1.11 — Returns & Barang Sisa (SalesReturns)
 *
 * View mandiri untuk mengelola retur dari customer:
 * - Daftar return dengan filter status/tipe
 * - Create return (dari SO yang sudah confirmed/done)
 * - Detail return (items, attachments)
 * - Approve / Reject (manager/admin)
 * - Upload bukti foto
 */
import { useState, useEffect } from "react";
import axios, { API } from "../../services/apiClient";
import ErrorNotice from "../../components/ErrorNotice";
import { CheckCircle2, Loader2, Plus, RotateCcw, Search, X, AlertCircle } from "lucide-react";
import { ReturnStatusPill, ReturnTypeBadge, fmtDate } from "./ReturnShared";
import ReturnDetail from "./ReturnDetail";
import CreateReturnForm from "./CreateReturnForm";


// ─── Main component ─────────────────────────────────────────────────────────
export default function SalesReturns({ currentUser, onNavigate }) {
  const [returns, setReturns]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch]         = useState("");
  const [selected, setSelected]     = useState(null);  // detail panel
  const [showCreate, setShowCreate] = useState(false);
  const [orders, setOrders]         = useState([]);
  const [notice, setNotice]         = useState(null);
  const [error, setError]           = useState(null);

  const token = localStorage.getItem("kn_token") || "";

  // Load returns
  async function load() {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/sales-returns`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReturns(res.data?.items || res.data || []);
    } catch (e) {
      setError("Gagal memuat data return: " + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  }

  // Load eligible orders for create form
  async function loadOrders() {
    try {
      const res = await axios.get(`${API}/sales-orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const all = res.data?.items || res.data || [];
      const eligible = all.filter(o =>
        ["confirmed","partially_picked","picked","partially_shipped","shipped","done"].includes(o.status)
      );
      setOrders(eligible);
    } catch (_) {}
  }

  useEffect(() => { load(); }, []);

  const filtered = returns.filter(r => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (!search) return true;
    return (
      r.number?.toLowerCase().includes(search.toLowerCase()) ||
      r.order_number?.toLowerCase().includes(search.toLowerCase()) ||
      r.customer_name?.toLowerCase().includes(search.toLowerCase())
    );
  });

  const canApprove = ["admin", "manager"].includes(currentUser?.role);
  const rTotal = returns.length;
  const rCnt = (s) => returns.filter(r => r.status === s).length;

  // ─── lifecycle actions (R1 state machine) ─────────────────────────────────
  async function handleApprove(ret) {
    try {
      const res = await axios.post(`${API}/sales-returns/${ret.id}/approve`, { notes: "" });
      setNotice(`${ret.number} disetujui. Lanjut ke inspeksi.`);
      setSelected(res.data); load();
    } catch (e) {
      setError("Gagal approve: " + (e.response?.data?.detail || e.message));
    }
  }

  async function handleStartInspect(ret) {
    try {
      const res = await axios.post(`${API}/sales-returns/${ret.id}/inspect/start`, {});
      setNotice(`Inspeksi ${ret.number} dimulai.`);
      setSelected(res.data); load();
    } catch (e) {
      setError("Gagal mulai inspeksi: " + (e.response?.data?.detail || e.message));
    }
  }

  async function handleCompleteInspect(ret, inspections, notes) {
    try {
      const res = await axios.post(`${API}/sales-returns/${ret.id}/inspect/complete`,
        { inspections, notes: notes || "" });
      setNotice(`Inspeksi ${ret.number} selesai. Pilih outcome untuk menyelesaikan.`);
      setSelected(res.data); load();
    } catch (e) {
      setError("Gagal simpan inspeksi: " + (e.response?.data?.detail || e.message));
    }
  }

  async function handleSettle(ret, outcome, itemDecisions, notes, returnWarehouseId, refundAccountCode) {
    try {
      const body = { outcome, item_decisions: itemDecisions || [], notes: notes || "" };
      if (returnWarehouseId) body.return_warehouse_id = returnWarehouseId;
      if (refundAccountCode) body.refund_account_code = refundAccountCode;
      const res = await axios.post(`${API}/sales-returns/${ret.id}/settle`, body);
      const st = res.data?.settlement || {};
      const cashMsg = st.cash_txn_number ? ` · refund tunai ${st.cash_txn_number}` : "";
      setNotice(`${ret.number} diselesaikan (${outcome})${cashMsg}.`);
      setSelected(res.data); load();
    } catch (e) {
      setError("Gagal settle: " + (e.response?.data?.detail || e.message));
    }
  }

  async function handleReject(ret, reason) {
    try {
      const res = await axios.post(`${API}/sales-returns/${ret.id}/reject`, { notes: reason });
      setNotice(`${ret.number} ditolak.`);
      setSelected(res.data); load();
    } catch (e) {
      setError("Gagal reject: " + (e.response?.data?.detail || e.message));
    }
  }

  async function handleReverse(ret, reason) {
    // R5.4 — reversal/koreksi retur settled (lempar error agar modal bisa tampilkan pesan).
    const res = await axios.post(`${API}/sales-returns/${ret.id}/reverse`, { notes: reason });
    const summ = res.data?._reversal_summary || {};
    setNotice(`${ret.number} dibatalkan (reversal) · ${summ.reversal_jes || 0} jurnal balik, ${summ.rolls_removed || 0} roll dihapus.`);
    setSelected(res.data); load();
    return res.data;
  }

  async function handleSubmit(ret) {
    try {
      const res = await axios.post(`${API}/sales-returns/${ret.id}/submit`, {});
      setNotice(`${ret.number} dikirim untuk approval.`);
      setSelected(res.data); load();
    } catch (e) {
      setError("Gagal submit: " + (e.response?.data?.detail || e.message));
    }
  }

  if (showCreate) {
    return (
      <CreateReturnForm
        orders={orders}
        token={token}
        onCreated={(doc) => {
          setShowCreate(false);
          setNotice(`${doc.number} berhasil dibuat.`);
          load();
          setSelected(doc);
        }}
        onCancel={() => setShowCreate(false)}
        onLoadOrders={loadOrders}
      />
    );
  }

  if (selected) {
    return (
      <ReturnDetail
        ret={selected}
        token={token}
        onNavigate={onNavigate}
        canApprove={canApprove}
        currentUser={currentUser}
        onApprove={handleApprove}
        onReject={handleReject}
        onSubmit={handleSubmit}
        onStartInspect={handleStartInspect}
        onCompleteInspect={handleCompleteInspect}
        onSettle={handleSettle}
        onReverse={handleReverse}
        onBack={() => { setSelected(null); load(); }}
        onAttachmentUploaded={(updated) => setSelected(updated)}
        notice={notice}
        onClearNotice={() => setNotice(null)}
      />
    );
  }

  return (
    <div data-testid="sales-returns-view" className="view-container">
      {/* Header */}
      <div className="view-header">
        <div>
          <h1 className="view-title">Retur & Barang Sisa</h1>
          <p className="view-subtitle">Kelola retur, barang sisa (BS), penggantian, komplain & garansi (aftersales) + Nota Kredit</p>
        </div>
        <button
          data-testid="create-return-btn"
          className="primary-button"
          onClick={() => { loadOrders(); setShowCreate(true); }}
        >
          <Plus size={15} /> Buat Return
        </button>
      </div>

      {/* Ringkasan */}
      <div data-testid="return-stats" className="grid grid-cols-2 gap-2 sm:grid-cols-4" style={{ marginBottom: 16 }}>
        {[
          { label: "Total Return", value: rTotal, icon: RotateCcw },
          { label: "Menunggu", value: rCnt("pending_approval"), icon: AlertCircle },
          { label: "Diproses", value: rCnt("approved") + rCnt("inspecting") + rCnt("inspected"), icon: CheckCircle2 },
          { label: "Selesai", value: rCnt("refund_settled") + rCnt("credit_settled") + rCnt("nego_settled"), icon: CheckCircle2 },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="metric-card">
            <div className="metric-icon"><Icon size={16} /></div>
            <div className="metric-body">
              <div className="metric-label">{label}</div>
              <div className="metric-value tabular-nums">{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Notices */}
      {notice && (
        <div className="notice-bar success" data-testid="return-notice">
          <CheckCircle2 size={14} /> {notice}
          <button onClick={() => setNotice(null)}><X size={12} /></button>
        </div>
      )}
      {error && (
        <ErrorNotice message={error} onRetry={load} onDismiss={() => setError(null)} testId="return-error" />
      )}

      {/* Filters */}
      <div className="filter-bar" style={{ marginBottom: 16 }}>
        <div className="search-wrap">
          <Search size={13} />
          <input
            data-testid="return-search"
            placeholder="Cari nomor / pesanan / pelanggan…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="tab-pills" data-testid="return-status-filter">
          {[
            ["all",             "Semua"],
            ["draft",           "Draft"],
            ["pending_approval","Menunggu"],
            ["approved",        "Disetujui"],
            ["inspecting",      "Inspeksi"],
            ["inspected",       "Selesai Inspeksi"],
            ["refund_settled",  "Refund"],
            ["credit_settled",  "Store Credit"],
            ["nego_settled",    "Nego"],
            ["rejected",        "Ditolak"],
          ].map(([v, l]) => (
            <button
              key={v}
              data-testid={`filter-${v}`}
              className={filterStatus === v ? "tab-pill active" : "tab-pill"}
              onClick={() => setFilterStatus(v)}
            >{l}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="empty-state"><Loader2 size={20} className="spin" /> Memuat...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state" data-testid="return-empty">
          <RotateCcw size={28} style={{ opacity: 0.3 }} />
          <p className="font-semibold">Belum ada data return{search ? ` untuk "${search}"` : ""}.</p>
          <p className="text-sm text-muted" style={{ maxWidth: 460, margin: "4px auto 0" }}>
            Kelola retur barang, barang sisa (BS), penggantian, komplain & garansi dari pesanan yang sudah dikirim. Setiap retur melewati alur <b>persetujuan → inspeksi → penyelesaian</b> (refund / store credit / nego / tolak).
          </p>
          <button className="primary-button" style={{ marginTop: 12 }} onClick={() => { loadOrders(); setShowCreate(true); }}>
            <Plus size={13} /> Buat Return Pertama
          </button>
        </div>
      ) : (
        <div className="table-wrap" data-testid="returns-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nomor</th>
                <th>No. Pesanan</th>
                <th>Pelanggan</th>
                <th>Tipe</th>
                <th>Status</th>
                <th>Items</th>
                <th>Nota Kredit</th>
                <th>Dibuat</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} data-testid={`return-row-${r.id}`}>
                  <td><strong>{r.number}</strong></td>
                  <td className="font-mono text-sm">{r.order_number}</td>
                  <td>{r.customer_name || "-"}</td>
                  <td><ReturnTypeBadge type={r.return_type} /></td>
                  <td><ReturnStatusPill status={r.status} /></td>
                  <td>{r.items?.length || 0} item</td>
                  <td>
                    {r.credit_note_number ? (
                      <span className="feature-badge badge-green" data-testid={`return-cn-${r.id}`}>
                        {r.credit_note_number}
                      </span>
                    ) : (
                      <span className="text-muted text-sm">—</span>
                    )}
                  </td>
                  <td className="text-muted">{fmtDate(r.created_at)}</td>
                  <td>
                    <button
                      data-testid={`view-return-${r.id}`}
                      className="link-button"
                      onClick={() => setSelected(r)}
                    >Detail</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
