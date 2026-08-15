"""Enum Registry router (Fase A · PS-01/02/03/09 · R7).

Satu-satunya sumber nilai enum domain untuk frontend. FE DILARANG hardcode
nilai grade/stage/fabric_type/process_type — konsumsi endpoint di sini.

Endpoint:
  GET  /api/enums                                → snapshot registry lengkap
  GET  /api/enums/stage-transitions              → matriks transisi stage (PS-01)
  POST /api/enums/stage-transitions/validate     → validasi transisi (400 bila ilegal)
  POST /api/enums/products/validate              → pratinjau validasi domain produk
  GET  /api/enums/{name}                         → satu enum
"""
from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

import domain_registry as dr
from dependencies import current_user

router = APIRouter(prefix="/api")


class TransitionCheckIn(BaseModel):
    from_stage: str
    process_type: str
    target_use: Optional[str] = None
    fabric_type: Optional[str] = None
    to_stage: Optional[str] = None


class ProductValidateIn(BaseModel):
    stage: Optional[str] = "finished"
    fabric_type: Optional[str] = None
    grade: Optional[str] = None
    gramasi: Optional[float] = None
    lebar: Optional[float] = None
    yarn_count: Optional[str] = None
    yarn_count_system: Optional[str] = None


@router.get("/enums")
async def list_enums(request: Request) -> Dict[str, Any]:
    """Snapshot registry (enum + matriks transisi + aturan kelengkapan field)."""
    await current_user(request)   # INV-AUTH-01 — minimal login, TIDAK di dalam try/except
    snap = dr.registry_snapshot()
    snap["stage_transition_matrix"] = dr.transition_matrix()
    return snap


@router.get("/enums/stage-transitions")
async def stage_transitions(request: Request, from_stage: str = "") -> Dict[str, Any]:
    """Daftar + matriks transisi stage yang dikunci server (PS-01)."""
    await current_user(request)
    rows = dr.transitions(from_stage or None)
    return {"from_stage": from_stage or None, "count": len(rows),
            "transitions": rows, "matrix": dr.transition_matrix(),
            "stages": dr.enum_items("stage"), "process_types": dr.enum_items("process_type"),
            "target_uses": dr.enum_items("target_use")}


@router.post("/enums/stage-transitions/validate")
async def validate_stage_transition(payload: TransitionCheckIn, request: Request) -> Dict[str, Any]:
    """Validasi transisi stage. Transisi ilegal → HTTP 400 (pesan Indonesia)."""
    await current_user(request)
    try:
        return dr.resolve_transition(payload.from_stage, payload.process_type,
                                     payload.target_use, payload.fabric_type, payload.to_stage)
    except dr.DomainValidationError as exc:
        raise HTTPException(status_code=400, detail=exc.message)


@router.post("/enums/products/validate")
async def validate_product_domain(payload: ProductValidateIn, request: Request) -> Dict[str, Any]:
    """Pratinjau validasi kelengkapan domain produk (dipakai form sebelum simpan)."""
    await current_user(request)
    return dr.validate_product(payload.model_dump(exclude_none=True))


@router.get("/enums/{name}")
async def get_enum(name: str, request: Request) -> Dict[str, Any]:
    """Satu enum beserta metadata (label, PS/keputusan sumber, nilai)."""
    await current_user(request)
    try:
        return dr.enum_meta(name)
    except dr.DomainValidationError as exc:
        raise HTTPException(status_code=404, detail=exc.message)
