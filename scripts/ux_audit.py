#!/usr/bin/env python3
"""
ux_audit.py — Kain Nusantara (KN3) UX Baseline Enforcer
=======================================================
Mengubah docs/UX_USABILITY_STANDARD.md dari prosa menjadi cek EXECUTABLE.
Scan frontend/src/features + components (kecuali components/ui = shadcn primitives)
untuk pelanggaran baseline UX yang sering jadi sumber "jelek tapi lolos":

  E1  Tabel data tanpa LOADING state            (ERROR)
  E2  Tabel data tanpa EMPTY state              (ERROR)
  E3  Chart (recharts) tanpa EMPTY-state guard  (ERROR)
  W1  Kolom uang tanpa `tabular-nums`           (WARN  — backlog presisi angka)
  W2  Native <select> (bukan shadcn Select)     (WARN)
  W3  Elemen interaktif tanpa data-testid        (WARN  — testability)

Usage:
    python scripts/ux_audit.py            # ringkasan (exit 0)
    python scripts/ux_audit.py --strict   # exit 1 bila ada ERROR (untuk gate)
    python scripts/ux_audit.py --file features/orders/OrdersView.jsx
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "frontend" / "src"
SCAN_DIRS = [SRC / "features", SRC / "components"]
G, Y, R, C, B, X = "\033[92m", "\033[93m", "\033[91m", "\033[96m", "\033[1m", "\033[0m"

# *Field / *Input components render FORM CONTROLS (radio/checkbox/text), not data
# tables — exempt them from the table loading/empty baseline (E1/E2).
FORM_HINTS = ("Form", "Modal", "Dialog", "Drawer", "Editor", "Create", "Edit", "Wizard", "Panel", "Uploader", "Field", "Input", "Login", "QuickView")


def rel(p):
    return str(p.relative_to(SRC))


def analyze(path):
    """Kembalikan list (severity, code, msg)."""
    t = path.read_text(encoding="utf-8", errors="ignore")
    findings = []
    is_form = any(h in path.name for h in FORM_HINTS)

    renders_rows = bool(re.search(r'<table', t) or re.search(r'\.map\(\s*\(?\w+', t))
    has_table = bool(re.search(r'<table|<tbody|role=["\']table', t)) or (
        renders_rows and re.search(r'<tr|<td|grid|divide-y', t))

    # Loading state: cek pola umum KN3 (loading/isLoading/Skeleton/Spinner/Loader)
    has_loading = bool(re.search(r'loading|isLoading|Skeleton|Spinner|Loader|animate-pulse', t, re.I))
    # Empty state
    has_empty = bool(re.search(r'length\s*===?\s*0|length\s*<\s*1|!\w+\.length|'
                               r'No\s|Belum ada|Tidak ada|Kosong|empty|Empty', t))

    if has_table and not is_form:
        if not has_loading:
            findings.append(("ERROR", "E1", "Tabel data tanpa LOADING state"))
        if not has_empty:
            findings.append(("ERROR", "E2", "Tabel data tanpa EMPTY state"))

    # Chart (recharts) — hanya deteksi jika import recharts atau JSX chart element (BUKAN icon BarChart2 dll)
    if re.search(r'from\s+["\']recharts["\']|<(Line|Area|Pie|Radar)Chart\b|<BarChart[\s>]', t):
        if not has_empty:
            findings.append(("ERROR", "E3", "Chart tanpa EMPTY-state guard"))
        if 'Tooltip' not in t:
            findings.append(("WARN", "W4", "Chart tanpa <Tooltip>"))

    # Money tanpa tabular-nums
    if re.search(r'formatCurrency|Rp\s|currency', t) and 'tabular-nums' not in t:
        findings.append(("WARN", "W1", "Tampilan uang tanpa class `tabular-nums`"))

    # Native select
    if re.search(r'<select[\s>]', t):
        findings.append(("WARN", "W2", "Native <select> — gunakan komponen Select (shadcn)"))

    # Interaktif tanpa testid (hanya bila file punya banyak tombol)
    n_btn = len(re.findall(r'<(button|Button)\b', t))
    n_testid = len(re.findall(r'data-testid', t))
    if n_btn >= 3 and n_testid == 0:
        findings.append(("WARN", "W3", f"{n_btn} tombol, 0 data-testid (sulit dites)"))
    return findings


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--file")
    args = ap.parse_args()

    files = []
    if args.file:
        files = [SRC / args.file]
    else:
        for d in SCAN_DIRS:
            for f in d.rglob("*.jsx"):
                if "/ui/" in str(f).replace("\\", "/"):
                    continue
                files.append(f)
    files = sorted(set(files))

    total_err = total_warn = 0
    err_files = []
    print(f"\n{B}{C}KN3 — UX BASELINE AUDIT ({len(files)} file){X}\n")
    for f in files:
        fnd = analyze(f)
        if not fnd:
            continue
        errs = [x for x in fnd if x[0] == "ERROR"]
        warns = [x for x in fnd if x[0] == "WARN"]
        total_err += len(errs); total_warn += len(warns)
        if errs:
            err_files.append(rel(f))
        head = f"{R}●{X}" if errs else f"{Y}○{X}"
        print(f"{head} {B}{rel(f)}{X}")
        for sev, code, msg in fnd:
            c = R if sev == "ERROR" else Y
            print(f"    {c}[{sev} {code}]{X} {msg}")

    print(f"\n{B}{'='*60}{X}")
    print(f"  {R}ERROR {total_err}{X}  |  {Y}WARN {total_warn}{X}  (di {len(files)} file)")
    print(f"{B}{'='*60}{X}")
    if total_err:
        print(f"\n  {R}{B}{len(err_files)} file melanggar baseline UX (loading/empty/chart).{X}")
        print("  Catatan: file lama = MIGRATION BACKLOG; file BARU/disentuh WAJIB lolos.")
    else:
        print(f"\n  {G}{B}Tidak ada pelanggaran ERROR baseline UX.{X}")
    print()
    if args.strict and total_err:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
