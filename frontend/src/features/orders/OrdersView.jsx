import { useEffect, useState } from "react";
import { BarChart2, FileText, Search, XCircle, Check, Route } from "lucide-react";
import { formatCurrency } from "../../utils/formatters";
import { StagePill, SubStatusChips } from "../../components/SoStatusBadges";
import OrderDashboard from "./OrderDashboard";
import { OrderDetailPanel } from "./OrderDetailPanel";
// FASE E-8 (E8.14 · US12) — "barang saya sampai mana?" adalah pertanyaan pelanggan yang
// paling sering mampir ke sales, dan jawabannya dulu hanya ada di layar GUDANG (403 untuk
// sales). Panel ini membawa jawabannya ke layar Pesanan, read-only.
import OrderJourneyPanel from "./OrderJourneyPanel";
import KNSelect from "../../components/KNSelect";
import EntityBadge from "../../components/EntityBadge";
import { scopeSuffix } from "../../utils/entityLabel";
import { useEntityScope } from "../../context/EntityScopeContext";

export default function OrdersView({ 
  orders, 
  onApprove, 
  onConfirm, 
  onCancel, 
  onPay, 
  onGenerateDocument, 
  onShowDetail, 
  onReleaseReservation,
  onSubmitForApproval,
  onMarkDelivered,
  onIssueTaxInvoice,
  user,
  loading = false,
  focusDoc,
  onClearFocus,
  onOpenDocument,
  onRefresh,
}) {
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  // FASE E-3 — empty state WAJIB menyebut badan usaha yang sedang dilihat,
  // supaya "belum ada pesanan" tidak dikira data hilang padahal salah konteks.
  const { selectedEntity, entities } = useEntityScope();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("list");
  // Panel kanan punya DUA muka: "Detail & Aksi" (tindakan sesuai izin) dan
  // "Perjalanan Pesanan" (riwayat + sumber pemenuhan). Dipisah sebagai sakelar,
  // bukan digabung, supaya panel aksi tidak terdorong ke bawah lipatan layar.
  const [detailPane, setDetailPane] = useState("detail");

  // EPIC6 — deep-link: auto-pilih order saat dinavigasi dari Document Hub.
  useEffect(() => {
    if (focusDoc?.focus_type === "sales_order" && focusDoc?.focus_id) {
      setViewMode("list");
      setStatusFilter("all");
      setSelectedOrder(focusDoc.focus_id);
      onClearFocus?.();
    }
  }, [focusDoc]); // eslint-disable-line
  
  const sel = selectedOrder ? orders.find(o => o.id === selectedOrder) || orders[0] : null;
  
  const filteredOrders = orders
    .filter(o => statusFilter === "all" || o.status === statusFilter)
    .filter(o => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        o.number?.toLowerCase().includes(q) ||
        o.customer_name?.toLowerCase().includes(q) ||
        o.sales_name?.toLowerCase().includes(q) ||
        o.items?.some(item => 
          item.sku?.toLowerCase().includes(q) || 
          item.product_name?.toLowerCase().includes(q)
        )
      );
    });
  
  const stats = {
    total: orders.length,
    reserved: orders.filter(o => ["reserved", "waiting_approval", "approved"].includes(o.status)).length,
    backorder: orders.filter(o => o.has_backorder).length,
    confirmed: orders.filter(o => ["confirmed", "partially_picked", "picked"].includes(o.status)).length,
    shipped: orders.filter(o => ["partially_shipped", "shipped", "dispatched"].includes(o.status)).length,
    done: orders.filter(o => o.status === "done").length,
    cancelled: orders.filter(o => o.status === "cancelled").length,
  };

  return (
    <div data-testid="orders-view" className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode("dashboard")}
          className={`px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors ${
            viewMode === "dashboard"
              ? "bg-[#007AFF] text-white"
              : "bg-white border border-[#E5E5EA] text-[#3C3C43] hover:bg-[#F2F2F7]"
          }`}
          data-testid="tab-dashboard"
        >
          <BarChart2 size={14} className="inline mr-1.5" />
          Dasbor & Analitik
        </button>
        <button
          onClick={() => setViewMode("list")}
          className={`px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors ${
            viewMode === "list"
              ? "bg-[#007AFF] text-white"
              : "bg-white border border-[#E5E5EA] text-[#3C3C43] hover:bg-[#F2F2F7]"
          }`}
          data-testid="tab-list"
        >
          <FileText size={14} className="inline mr-1.5" />
          Daftar Pesanan
        </button>
      </div>
      
      {viewMode === "dashboard" && <OrderDashboard orders={orders} loading={loading} />}
      
      {viewMode === "list" && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {[
              { label: "Total", value: stats.total, color: "text-[#007AFF]", bg: "bg-[#EFF4FF]" },
              { label: "Dipesan", value: stats.reserved, color: "text-[#FF9500]", bg: "bg-orange-50" },
              { label: "Backorder", value: stats.backorder, color: "text-[#B23B14]", bg: "bg-[#FFF1EA]" },
              { label: "Diproses", value: stats.confirmed, color: "text-[#34C759]", bg: "bg-green-50" },
              { label: "Dikirim", value: stats.shipped, color: "text-[#0058CC]", bg: "bg-[#EAF2FF]" },
              { label: "Selesai", value: stats.done, color: "text-[#5856D6]", bg: "bg-purple-50" },
              { label: "Dibatalkan", value: stats.cancelled, color: "text-red-500", bg: "bg-red-50" },
            ].map(({ label, value, color, bg }) => (
              <div key={label} data-testid={`orders-stat-${label.toLowerCase()}`} className={`rounded-lg border border-[#EFF0F2] p-2.5 ${bg}`}>
                <p className="text-[9px] font-bold uppercase tracking-wide text-[#6B6B73]">{label}</p>
                <p className={`text-[20px] font-bold leading-tight ${color}`}>{value}</p>
              </div>
            ))}
          </div>
          
          <div className="flex items-center gap-2 rounded-lg border border-[#E5E5EA] bg-white px-3 py-2">
            <Search size={14} className="text-[#6B6B73]" />
            <input
              type="text"
              data-testid="orders-search-input"
              className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-[#8E8E93]"
              placeholder="Cari nomor pesanan, pelanggan, produk…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="text-[#6B6B73] hover:text-black">
                <XCircle size={14} />
              </button>
            )}
          </div>
          
          <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
            <section className="section-card">
              <div className="section-head">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="kicker">Kendali Pesanan</span>
                  <h2>Sales Orders</h2>
                </div>
                <KNSelect
                  className="field !py-1 !text-[11px] w-auto"
                  value={statusFilter}
                  onValueChange={setStatusFilter}
                  options={[
                    { value: "all", label: `Semua Status (${orders.length})` },
                    { value: "waiting_approval", label: "Menunggu Persetujuan" },
                    { value: "waiting_stock", label: "Menunggu Stok (Backorder)" },
                    { value: "reserved", label: "Dipesan" },
                    { value: "approved", label: "Disetujui" },
                    { value: "confirmed", label: "Terkonfirmasi (Ditahan)" },
                    { value: "partially_picked", label: "Sebagian Diambil" },
                    { value: "picked", label: "Sudah Diambil (Siap)" },
                    { value: "partially_shipped", label: "Partially Shipped" },
                    { value: "shipped", label: "Shipped" },
                    { value: "dispatched", label: "Terkirim (lama)" },
                    { value: "done", label: "Selesai (Terkirim)" },
                    { value: "cancelled", label: "Dibatalkan" },
                  ]}
                />
              </div>
              <div className="overflow-hidden">
                <div className="grid grid-cols-[1fr_90px_90px_120px] bg-[#FAFBFC] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[#6B6B73] border-b border-[#EFF0F2]">
                  <span>Pesanan</span><span>Pelanggan</span><span>Total</span><span>Tahap</span>
                </div>
                <div className="divide-y divide-[#EFF0F2] max-h-[600px] overflow-y-auto">
                  {loading && (
                    <div className="px-3 py-8 text-center text-[12px] text-[#6B6B73] animate-pulse">Memuat pesanan…</div>
                  )}
                  {!loading && filteredOrders.length === 0 && (
                    <div data-testid="orders-empty" className="px-3 py-8 text-center text-[12px] text-[#6B6B73]">
                      {statusFilter === "all"
                        ? `Belum ada pesanan aktif ${scopeSuffix(entities, selectedEntity)}.`
                        : `Tidak ada pesanan berstatus “${statusFilter}” ${scopeSuffix(entities, selectedEntity)}.`}
                    </div>
                  )}
                  {!loading && filteredOrders.map((order) => (
                    <div 
                      data-testid={`order-card-${order.id}`} 
                      key={order.id}
                      className={`grid grid-cols-[1fr_90px_90px_120px] items-center px-3 py-2.5 cursor-pointer hover:bg-[#FAFBFC] transition-colors ${
                        selectedOrder === order.id ? 'bg-[#EFF4FF] border-l-2 border-[#007AFF]' : ''
                      }`}
                      onClick={() => setSelectedOrder(order.id === selectedOrder ? null : order.id)}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p data-testid={`order-number-${order.id}`} className="text-[12px] font-bold text-[#007AFF]">
                            {order.number}
                          </p>
                          <EntityBadge entityId={order.entity_id} />
                          {order.has_backorder && (
                            <span
                              data-testid={`order-backorder-chip-${order.id}`}
                              className="rounded-sm bg-[#FFF1EA] px-1 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-[#B23B14]"
                            >
                              Backorder
                            </span>
                          )}
                        </div>
                        <p className="text-[10.5px] text-[#6B6B73] truncate">
                          {(order.items || []).length} item · {order.payment_status === 'paid' ? <span className="inline-flex items-center gap-0.5 text-green-600"><Check size={11} /> Lunas</span> : 'Belum bayar'}
                        </p>
                      </div>
                      <p data-testid={`order-customer-${order.id}`} className="text-[11px] text-[#3C3C43] truncate">
                        {order.customer_name}
                      </p>
                      <p data-testid={`order-total-${order.id}`} className="text-[11.5px] font-bold tabular-nums">
                        {formatCurrency(order.total_amount)}
                      </p>
                      <div className="flex flex-col items-start gap-0.5 min-w-0">
                        <StagePill order={order} testId={`order-status-${order.id}`} />
                        <SubStatusChips order={order} testIdPrefix={`order-row-substatus-${order.id}`} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {sel ? (
              <div className="grid gap-2">
                <div className="flex gap-1.5" data-testid="order-pane-switch">
                  <button type="button" data-testid="order-pane-detail"
                    onClick={() => setDetailPane("detail")}
                    className={`tab-button ${detailPane === "detail" ? "active" : ""}`}>
                    <FileText size={12} className="mr-1 inline" /> Detail &amp; Aksi
                  </button>
                  <button type="button" data-testid="order-pane-journey"
                    onClick={() => setDetailPane("journey")}
                    className={`tab-button ${detailPane === "journey" ? "active" : ""}`}>
                    <Route size={12} className="mr-1 inline" /> Perjalanan Pesanan
                  </button>
                </div>

                {detailPane === "journey" ? (
                  <OrderJourneyPanel orderId={sel.id} orderNumber={sel.number} />
                ) : (
                  <OrderDetailPanel
                    order={sel}
                    user={user}
                    onRefresh={onRefresh}
                    onApprove={onApprove}
                    onConfirm={onConfirm}
                    onCancel={onCancel}
                    onPay={onPay}
                    onGenerateDocument={onGenerateDocument}
                    onReleaseReservation={onReleaseReservation}
                    onSubmitForApproval={onSubmitForApproval}
                    onMarkDelivered={onMarkDelivered}
                    onIssueTaxInvoice={onIssueTaxInvoice}
                    onOpenDocument={onOpenDocument}
                    onClose={() => setSelectedOrder(null)}
                  />
                )}
              </div>
            ) : (
              <aside className="section-card flex items-center justify-center min-h-[200px] border-dashed">
                <div className="text-center p-6">
                  <FileText size={28} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-[12px] text-[#6B6B73]">Pilih pesanan untuk lihat detail & aksi</p>
                </div>
              </aside>
            )}
          </div>
        </>
      )}
    </div>
  );
}
