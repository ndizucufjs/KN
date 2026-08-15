/**
 * AccountList (FASE E-3 / E-2) — daftar akun dengan LENCANA badan usaha.
 *
 * Pertanyaan yang harus bisa dijawab dalam sekali lihat: siapa bekerja di badan
 * usaha mana, apakah akunnya tertaut data karyawan (HR), dan apakah dia masih
 * dipakai (login terakhir). Kolom “Taut HR” sengaja menampilkan PERINGATAN, karena
 * akun tanpa tautan HR adalah sumber utama badan usaha akun ≠ badan usaha payroll.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, UserPlus, KeyRound, Power, RotateCcw, LogOut, AlertTriangle,
  Loader2, Pencil } from "lucide-react";

import EntityBadge from "../../../components/EntityBadge";
import AccountFormDrawer from "./AccountFormDrawer";
import { listUsers, deactivateUser, reactivateUser, resetUserPassword,
  revokeUserSessions, ROLE_OPTIONS, errText } from "./entityApi";

const STATUSES = [
  { key: "", label: "Semua status" },
  { key: "active", label: "Aktif" },
  { key: "inactive", label: "Nonaktif" },
];

function fmtDate(iso) {
  if (!iso) return "belum pernah";
  try {
    return new Date(iso).toLocaleDateString("id-ID",
      { day: "2-digit", month: "short", year: "2-digit" });
  } catch { return "—"; }
}

export default function AccountList({ entities = [], currentUser, selectedEntity,
  onChanged, onError }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState(null);   // {} = akun baru

  const isAdmin = currentUser?.role === "admin";
  const activeEntities = useMemo(
    () => entities.filter((e) => e.status === "active"), [entities]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listUsers({
        page, page_size: pageSize,
        ...(q ? { q } : {}),
        ...(role ? { role } : {}),
        ...(status ? { status } : {}),
        ...(entityFilter ? { entity_id: entityFilter } : {}),
      });
      setRows(res?.items || []);
      setTotal(res?.total || 0);
    } catch (e) {
      onError?.(errText(e, "Gagal memuat daftar akun."));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q, role, status, entityFilter, onError]);

  useEffect(() => { load(); }, [load]);

  const act = async (fn, id, okMsg) => {
    setBusy(id);
    try {
      const res = await fn(id);
      onChanged?.(typeof okMsg === "function" ? okMsg(res) : okMsg);
      await load();
    } catch (e) {
      onError?.(errText(e, "Aksi akun gagal."));
    } finally {
      setBusy("");
    }
  };

  const doReset = async (u) => {
    const pwd = window.prompt(
      `Password baru untuk ${u.name} (minimal 8 karakter).\n`
      + "Semua sesi lamanya akan dicabut dan dia harus masuk lagi.", "");
    if (!pwd) return;
    setBusy(u.id);
    try {
      const res = await resetUserPassword(u.id, pwd);
      onChanged?.(`${res.message} (${res.sessions_revoked} sesi dicabut)`);
    } catch (e) {
      onError?.(errText(e, "Gagal reset password."));
    } finally {
      setBusy("");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="section-card" data-testid="account-list-card">
      <div className="section-head">
        <div className="flex items-center gap-2">
          <h2 data-testid="account-list-title">Akun & Akses</h2>
          <span className="text-[10.5px] text-[#9A9BA3] tabular-nums"
                data-testid="account-list-count">{total} akun</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1" data-testid="account-entity-filter">
            <button type="button" data-testid="account-entity-all"
                    onClick={() => { setEntityFilter(""); setPage(1); }}
                    className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                      !entityFilter ? "bg-[#007AFF] text-white"
                        : "border border-[#E5E5EA] bg-white text-[#6B6B73]"}`}>
              Semua badan usaha
            </button>
            {activeEntities.map((e) => (
              <button key={e.id} type="button" data-testid={`account-entity-${e.id}`}
                      onClick={() => { setEntityFilter(e.id); setPage(1); }}
                      className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                        entityFilter === e.id ? "bg-[#007AFF] text-white"
                          : "border border-[#E5E5EA] bg-white text-[#6B6B73]"}`}>
                {e.short_name || e.legal_name}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1" data-testid="account-status-filter">
            {STATUSES.map((s) => (
              <button key={s.key || "all"} type="button"
                      data-testid={`account-status-${s.key || "all"}`}
                      onClick={() => { setStatus(s.key); setPage(1); }}
                      className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                        status === s.key ? "bg-[#6B219A] text-white"
                          : "border border-[#E5E5EA] bg-white text-[#6B6B73]"}`}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#9A9BA3]" />
            <input data-testid="account-search-input" className="field pl-7 py-1 text-[12px]"
                   placeholder="Cari nama / email…" value={q}
                   onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          {isAdmin && (
            <button type="button" className="primary-button" data-testid="account-add-button"
                    onClick={() => setEditing({})}>
              <UserPlus size={14} /> Buat Akun
            </button>
          )}
        </div>
      </div>

      <div className="section-body">
        <div className="mb-2 flex flex-wrap items-center gap-1" data-testid="account-role-filter">
          <span className="text-[10px] font-bold uppercase text-[#8E8E93]">Peran</span>
          <button type="button" data-testid="account-role-all"
                  onClick={() => { setRole(""); setPage(1); }}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                    !role ? "bg-[#1C1C1E] text-white"
                      : "border border-[#E5E5EA] bg-white text-[#6B6B73]"}`}>
            Semua
          </button>
          {ROLE_OPTIONS.map((r) => (
            <button key={r.value} type="button" data-testid={`account-role-${r.value}`}
                    onClick={() => { setRole(r.value); setPage(1); }}
                    className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                      role === r.value ? "bg-[#1C1C1E] text-white"
                        : "border border-[#E5E5EA] bg-white text-[#6B6B73]"}`}>
              {r.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid gap-2" data-testid="account-list-loading">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded bg-[#F5F5F7]" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-[12px] text-[#8E8E93]"
               data-testid="account-list-empty">
            Tidak ada akun yang cocok dengan filter ini.
          </div>
        ) : (
          <div className="overflow-auto rounded-md border border-[#EFF0F2]">
            <table className="w-full text-[12px]" data-testid="account-list-table">
              <thead>
                <tr className="border-b border-[#EFF0F2] bg-[#FAFBFC] text-left text-[10px] font-bold uppercase text-[#8E8E93]">
                  <th className="px-3 py-2">Nama & email</th>
                  <th className="px-3 py-2">Peran</th>
                  <th className="px-3 py-2">Badan usaha utama</th>
                  <th className="px-3 py-2">Badan usaha diizinkan</th>
                  <th className="px-3 py-2">Taut HR</th>
                  <th className="px-3 py-2">Terakhir masuk</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} data-testid={`account-row-${u.id}`}
                      className="border-b border-[#F5F5F7] last:border-0 hover:bg-[#FAFBFF]">
                    <td className="px-3 py-2">
                      <p className="font-semibold text-[#1C1C1E]">{u.name}</p>
                      <p className="text-[10px] text-[#9A9BA3]">{u.email}</p>
                    </td>
                    <td className="px-3 py-2 text-[#3C3C43]" data-testid={`account-role-cell-${u.id}`}>
                      {ROLE_OPTIONS.find((r) => r.value === u.role)?.label || u.role}
                    </td>
                    <td className="px-3 py-2" data-testid={`account-home-${u.id}`}>
                      <EntityBadge entityId={u.home_entity_id} entities={entities} />
                    </td>
                    <td className="px-3 py-2" data-testid={`account-allowed-${u.id}`}>
                      <div className="flex flex-wrap gap-1">
                        {(u.allowed_entity_ids || []).map((id) => (
                          <EntityBadge key={id} entityId={id} entities={entities} />
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2" data-testid={`account-hr-${u.id}`}>
                      {u.hr_link_warning ? (
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#B45309]"
                              title={u.hr_link_warning}>
                          <AlertTriangle size={11} /> {u.hr_link_warning}
                        </span>
                      ) : (
                        <span className="text-[10.5px] text-[#1B7F4B]">
                          {u.employee?.code} {u.employee?.name}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[10.5px] text-[#6B6B73] tabular-nums">
                      {fmtDate(u.last_login_at)}
                      {u.has_active_session && (
                        <span className="ml-1 rounded bg-[#E6F6EC] px-1 text-[9px] font-bold text-[#1B7F4B]">
                          sesi aktif
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="status-pill" data-testid={`account-status-pill-${u.id}`}
                            style={u.status === "active"
                              ? { background: "#E6F6EC", color: "#1B7F4B" }
                              : { background: "#F2F2F7", color: "#6B6B73" }}>
                        {u.status === "active" ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {isAdmin && (
                          <button type="button" className="secondary-button !py-1 !px-2 !text-[10.5px]"
                                  data-testid={`account-edit-${u.id}`}
                                  onClick={() => setEditing(u)}>
                            <Pencil size={11} /> Ubah
                          </button>
                        )}
                        {isAdmin && (
                          <button type="button" className="secondary-button !py-1 !px-2 !text-[10.5px]"
                                  data-testid={`account-reset-${u.id}`}
                                  disabled={busy === u.id} onClick={() => doReset(u)}>
                            <KeyRound size={11} /> Reset
                          </button>
                        )}
                        {isAdmin && u.has_active_session && (
                          <button type="button" className="secondary-button !py-1 !px-2 !text-[10.5px]"
                                  data-testid={`account-revoke-${u.id}`}
                                  disabled={busy === u.id}
                                  onClick={() => act(revokeUserSessions, u.id,
                                    (r) => `${r.sessions_revoked} sesi ${u.name} dicabut.`)}>
                            <LogOut size={11} /> Cabut sesi
                          </button>
                        )}
                        {isAdmin && u.status === "active" && (
                          <button type="button" className="secondary-button !py-1 !px-2 !text-[10.5px]"
                                  data-testid={`account-deactivate-${u.id}`}
                                  disabled={busy === u.id}
                                  onClick={() => act(deactivateUser, u.id,
                                    `Akun ${u.name} dinonaktifkan — datanya tetap tersimpan.`)}>
                            {busy === u.id ? <Loader2 size={11} className="animate-spin" />
                                           : <Power size={11} />} Nonaktifkan
                          </button>
                        )}
                        {isAdmin && u.status !== "active" && (
                          <button type="button" className="secondary-button !py-1 !px-2 !text-[10.5px]"
                                  data-testid={`account-reactivate-${u.id}`}
                                  disabled={busy === u.id}
                                  onClick={() => act(reactivateUser, u.id,
                                    `Akun ${u.name} aktif kembali.`)}>
                            <RotateCcw size={11} /> Aktifkan
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-2 flex items-center justify-between" data-testid="account-list-pager">
            <span className="text-[11px] text-[#6B6B73] tabular-nums">
              Halaman {page} dari {totalPages} · {total} akun
            </span>
            <div className="flex gap-1.5">
              <button type="button" className="secondary-button !py-1" data-testid="account-page-prev"
                      disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Sebelumnya</button>
              <button type="button" className="secondary-button !py-1" data-testid="account-page-next"
                      disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Berikutnya</button>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <AccountFormDrawer
          user={editing.id ? editing : null}
          entities={activeEntities}
          selectedEntity={selectedEntity}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); onChanged?.(msg); load(); }}
          onError={onError}
        />
      )}
    </div>
  );
}
