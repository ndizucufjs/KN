import { useState, useEffect } from "react";

/**
 * ConfirmModal — dialog konfirmasi generik (pengganti window.confirm/prompt).
 * Mendukung input alasan opsional (untuk aksi seperti tolak / tutup-kurang).
 *
 * Props:
 *  - open, title, message
 *  - confirmLabel, cancelLabel, danger (warna tombol konfirmasi)
 *  - withReason, reasonLabel, reasonRequired, reasonPlaceholder
 *  - onConfirm(reason) -> boleh async; busy state dikelola di sini
 *  - onCancel()
 *  - testId (prefix data-testid)
 */
export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Konfirmasi",
  cancelLabel = "Batal",
  danger = false,
  withReason = false,
  reasonLabel = "Alasan",
  reasonRequired = true,
  reasonPlaceholder = "",
  onConfirm,
  onCancel,
  testId = "confirm-modal",
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setReason(""); setBusy(false); }
  }, [open]);

  if (!open) return null;

  const blocked = busy || (withReason && reasonRequired && !reason.trim());

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm?.(reason.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" data-testid={testId} onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel?.(); }}>
      <div className="modal-card small">
        <p className="modal-title">{title}</p>
        {message && <p className="modal-subtitle">{message}</p>}
        {withReason && (
          <div className="grid gap-1.5 mt-2">
            <label className="text-[11px] font-bold uppercase text-[#6B6B73]">
              {reasonLabel}{reasonRequired ? " *" : ""}
            </label>
            <textarea
              data-testid={`${testId}-reason`}
              className="form-input"
              rows="3"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
            />
          </div>
        )}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button
            data-testid={`${testId}-confirm`}
            className={danger ? "btn-danger" : "btn-primary"}
            onClick={handleConfirm}
            disabled={blocked}
          >
            {busy ? "Memproses…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
