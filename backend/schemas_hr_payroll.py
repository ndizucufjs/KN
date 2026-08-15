"""Skema input HRD H4 — Payroll."""
from typing import Any, Dict, Optional
from pydantic import BaseModel


class PayrollRunInput(BaseModel):
    entity_id: str
    period: str  # YYYY-MM


class PayRunInput(BaseModel):
    cash_account: Optional[str] = None  # kode akun kas/bank untuk disbursement


class HrSettingsUpdate(BaseModel):
    settings: Dict[str, Any]
