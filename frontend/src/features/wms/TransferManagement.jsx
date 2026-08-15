import { useEffect, useState } from "react";
import { Truck, Plus, ArrowRight, Package, AlertCircle } from "lucide-react";
import axios, { API } from "../../services/apiClient";
import ErrorNotice from "../../components/ErrorNotice";
import { StatusBadge } from "./transfer/transferConstants";
import TransferCreateForm from "./transfer/TransferCreateForm";
import TransferDetailModal from "./transfer/TransferDetailModal";

/**
 * TransferManagement
 *
 * Panel untuk mengelola transfer antar gudang dengan workflow:
 * draft → waiting_approval → approved → picking → staging → dispatched → completed
 *
 * Sub-components live in ./transfer/ (kept under file-size limits per KN_02).
 */
export default function TransferManagement({ user }) {
  const [transfers, setTransfers] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedTransfer, setSelectedTransfer] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");

  // Form state
  const [formData, setFormData] = useState({
    source_warehouse_id: "",
    dest_warehouse_id: "",
    items: [],
    notes: ""
  });
  const [newItem, setNewItem] = useState({ product_id: "", qty: 0, unit: "meter" });

  useEffect(() => {
    fetchTransfers();
    fetchMasterData();
  }, [filterStatus]);

  const fetchTransfers = async () => {
    setLoading(true);
    try {
      const params = filterStatus !== "all" ? `?status=${filterStatus}` : "";
      const response = await axios.get(`${API}/transfers${params}`);
      setTransfers(response.data);
      setError("");
    } catch (error) {
      setError(error.response?.data?.detail || "Gagal memuat transfer antar gudang.");
    } finally {
      setLoading(false);
    }
  };

  const fetchMasterData = async () => {
    try {
      const [productsRes, warehousesRes] = await Promise.all([
        axios.get(`${API}/products`),
        axios.get(`${API}/warehouses`)
      ]);
      setProducts(productsRes.data);
      setWarehouses(warehousesRes.data);
    } catch (error) {
      console.error("Error fetching master data:", error);
    }
  };

  const resetForm = () => setFormData({ source_warehouse_id: "", dest_warehouse_id: "", items: [], notes: "" });

  const handleCreateTransfer = async () => {
    if (!formData.source_warehouse_id || !formData.dest_warehouse_id) {
      alert("Pilih gudang source dan destination");
      return;
    }
    if (formData.items.length === 0) {
      alert("Tambahkan minimal 1 item");
      return;
    }
    try {
      await axios.post(`${API}/transfers`, { ...formData, requested_by: user?.name || "User" });
      alert("Transfer berhasil dibuat");
      setShowCreateForm(false);
      resetForm();
      fetchTransfers();
    } catch (error) {
      alert(error.response?.data?.detail || "Gagal membuat transfer");
    }
  };

  const handleAddItem = () => {
    if (!newItem.product_id || newItem.qty <= 0) {
      alert("Pilih produk dan masukkan qty valid");
      return;
    }
    setFormData({ ...formData, items: [...formData.items, { ...newItem }] });
    setNewItem({ product_id: "", qty: 0, unit: "meter" });
  };

  const handleRemoveItem = (index) => {
    setFormData({ ...formData, items: formData.items.filter((_, i) => i !== index) });
  };

  const handleApprove = async (transferId) => {
    try {
      await axios.post(`${API}/transfers/${transferId}/approve`, { approved_by: user?.name || "Manager" });
      alert("Transfer diapprove");
      fetchTransfers();
      setSelectedTransfer(null);
    } catch (error) {
      alert(error.response?.data?.detail || "Gagal approve");
    }
  };

  const handleReject = async (transferId) => {
    const reason = prompt("Alasan reject:");
    if (!reason) return;
    try {
      await axios.post(`${API}/transfers/${transferId}/reject`, { rejected_by: user?.name || "Manager", reason });
      alert("Transfer direject");
      fetchTransfers();
      setSelectedTransfer(null);
    } catch (error) {
      alert(error.response?.data?.detail || "Gagal reject");
    }
  };

  const handleUpdateStatus = async (transferId, newStatus) => {
    try {
      await axios.post(`${API}/transfers/${transferId}/status`, { status: newStatus, updated_by: user?.name || "Warehouse" });
      alert(`Status diupdate ke ${newStatus}`);
      fetchTransfers();
      setSelectedTransfer(null);
    } catch (error) {
      alert(error.response?.data?.detail || "Gagal update status");
    }
  };

  const handleCancel = async (transferId) => {
    if (!confirm("Yakin ingin membatalkan transfer ini?")) return;
    try {
      await axios.delete(`${API}/transfers/${transferId}`);
      alert("Transfer dibatalkan");
      fetchTransfers();
      setSelectedTransfer(null);
    } catch (error) {
      alert(error.response?.data?.detail || "Gagal cancel");
    }
  };

  return (
    <div data-testid="transfer-management-panel" className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#007AFF]/10">
            <Truck className="text-[#007AFF]" size={20} />
          </div>
          <div>
            <h2 data-testid="panel-title" className="text-lg font-semibold text-[#000000]">
              Transfer Antar Gudang
            </h2>
            <p data-testid="panel-subtitle" className="text-sm text-[#3C3C43]">
              Kelola perpindahan persediaan antar gudang
            </p>
          </div>
        </div>
        <button
          data-testid="create-transfer-button"
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-2 bg-[#007AFF] hover:bg-[#0056B3] text-white rounded-full px-4 py-2 text-sm font-medium transition-all"
        >
          <Plus size={16} />
          Buat Transfer
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {["all", "waiting_approval", "approved", "picking", "staging", "dispatched", "completed"].map((status) => (
          <button
            key={status}
            data-testid={`filter-status-${status}`}
            onClick={() => setFilterStatus(status)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium whitespace-nowrap transition-all ${
              filterStatus === status
                ? "bg-[#007AFF] text-white"
                : "bg-white border border-[#E5E5EA] text-[#3C3C43] hover:border-[#007AFF]"
            }`}
          >
            {status === "all" ? "Semua" : status.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <TransferCreateForm
          formData={formData}
          setFormData={setFormData}
          newItem={newItem}
          setNewItem={setNewItem}
          products={products}
          warehouses={warehouses}
          onAddItem={handleAddItem}
          onRemoveItem={handleRemoveItem}
          onSubmit={handleCreateTransfer}
          onClose={() => { setShowCreateForm(false); resetForm(); }}
        />
      )}

      {/* Transfers List */}
      <ErrorNotice message={error} onRetry={fetchTransfers} onDismiss={() => setError("")} testId="transfer-error" />
      <div className="grid gap-3">
        {loading ? (
          <div className="text-center py-8 text-[#3C3C43]">Memuat…</div>
        ) : transfers.length === 0 ? (
          <div className="text-center py-10 text-[#3C3C43]">
            <AlertCircle size={48} className="mx-auto mb-2 text-gray-400" />
            <p className="font-semibold">Belum ada transfer antar gudang</p>
            <p className="text-[12px] text-[#6B6B73] mt-1">Buat transfer untuk memindahkan stok antar gudang.</p>
          </div>
        ) : (
          transfers.map((transfer) => (
            <div
              key={transfer.id}
              data-testid={`transfer-card-${transfer.id}`}
              className="bg-white border border-[#E5E5EA] rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedTransfer(transfer)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#007AFF]/10">
                    <Package className="text-[#007AFF]" size={18} />
                  </div>
                  <div>
                    <p data-testid={`transfer-code-${transfer.id}`} className="text-sm font-bold text-[#007AFF]">
                      {transfer.code}
                    </p>
                    <p data-testid={`transfer-route-${transfer.id}`} className="text-xs text-[#3C3C43]">
                      {transfer.source_warehouse_name} <ArrowRight size={12} className="inline" /> {transfer.dest_warehouse_name}
                    </p>
                  </div>
                </div>
                <StatusBadge status={transfer.status} />
              </div>

              <div className="text-xs text-[#3C3C43] space-y-1">
                <p><span className="font-semibold">Items:</span> {transfer.items?.length || 0}</p>
                <p><span className="font-semibold">Requested by:</span> {transfer.requested_by}</p>
                {transfer.approved_by && <p><span className="font-semibold">Disetujui oleh:</span> {transfer.approved_by}</p>}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Detail Modal */}
      {selectedTransfer && (
        <TransferDetailModal
          transfer={selectedTransfer}
          user={user}
          onClose={() => setSelectedTransfer(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onUpdateStatus={handleUpdateStatus}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
