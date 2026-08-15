"""Approval Requests Router

Manage approval requests (pending, approved, rejected).
"""
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from db import db
from dependencies import require_permission, current_user, audit
from entity_scope import entity_ctx, resolve_scope_ids
from services import approval_service

router = APIRouter(prefix="/api")


# ─── Schemas ─────────────────────────────────────────────────────────────────

class ApprovalDecision(BaseModel):
    """Approval decision"""
    notes: str = Field(default="", description="Decision notes")


class ApprovalReject(BaseModel):
    """Approval rejection"""
    reason: str = Field(..., min_length=1, description="Rejection reason")


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/approval-requests")
async def list_approval_requests(
    request: Request,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    status: Optional[str] = None,
    my_approvals: bool = False
) -> List[Dict[str, Any]]:
    """List approval requests.
    
    Query params:
    - entity_type: Filter by entity type
    - entity_id: Filter by specific entity
    - status: Filter by status (pending, approved, rejected)
    - my_approvals: Show only approvals for current user's role (pending only)
    """
    await require_permission(request, "approval", "view")
    user = await current_user(request)
    
    # If my_approvals, filter by user's role
    approver_role = None
    if my_approvals and status in [None, "pending"]:
        approver_role = user["role"]
    
    requests = await approval_service.get_approval_requests(
        entity_type=entity_type,
        entity_id=entity_id,
        status=status or "pending" if my_approvals else status,
        approver_role=approver_role
    )
    
    return requests


@router.get("/approval-requests/pending-count")
async def get_pending_approvals_count(
    request: Request
) -> Dict[str, int]:
    """Get count of pending approvals for current user's role."""
    await require_permission(request, "approval", "view")
    user = await current_user(request)
    
    count = await approval_service.get_pending_approvals_count(user["role"])
    
    return {"count": count}


@router.get("/approval-requests/{request_id}")
async def get_approval_request(
    request_id: str,
    request: Request
) -> Dict[str, Any]:
    """Get approval request by ID."""
    await require_permission(request, "approval", "view")
    
    approval_request = await db.approval_requests.find_one(
        {"id": request_id},
        {"_id": 0}
    )
    
    if not approval_request:
        raise HTTPException(status_code=404, detail="Approval request tidak ditemukan")
    
    # Enrich with rule details
    # FASE E-0 — aturan hanya boleh dibaca bila milik entitas ini atau warisan grup.
    _ids = resolve_scope_ids(await entity_ctx(request))
    rule = await db.approval_rules.find_one(
        {"id": approval_request["rule_id"]},
        {"_id": 0}
    )
    if rule:
        approval_request["rule"] = rule
    
    return approval_request


@router.post("/approval-requests/{request_id}/approve")
async def approve_request(
    request_id: str,
    payload: ApprovalDecision,
    request: Request
) -> Dict[str, Any]:
    """Approve approval request.
    
    Checks if user has required role to approve.
    """
    await require_permission(request, "approval", "approve")
    user = await current_user(request)
    
    # Get approval request
    approval_request = await db.approval_requests.find_one(
        {"id": request_id},
        {"_id": 0}
    )
    if not approval_request:
        raise HTTPException(status_code=404, detail="Approval request tidak ditemukan")
    
    if approval_request["status"] != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve request with status: {approval_request['status']}"
        )
    
    # Check if user has required role
    rule = await db.approval_rules.find_one(
        {"id": approval_request["rule_id"]},
        {"_id": 0}
    )
    
    if not rule:
        raise HTTPException(status_code=404, detail="Approval rule tidak ditemukan")
    
    if user["role"] != rule["approver_role"] and user["role"] != "admin":
        raise HTTPException(
            status_code=403,
            detail=f"Only {rule['approver_role']} or admin can approve this request"
        )
    
    # Approve request
    try:
        updated = await approval_service.approve_request(
            request_id,
            user["email"],
            payload.notes
        )
        
        # Audit log
        await audit(
            user.get("name", ""),
            "approval_request_approved",
            "approval_request",
            request_id,
            {
                "entity_type": approval_request["entity_type"],
                "entity_id": approval_request["entity_id"],
                "entity_number": approval_request["entity_number"]
            }
        )
        
        return updated
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/approval-requests/{request_id}/reject")
async def reject_request(
    request_id: str,
    payload: ApprovalReject,
    request: Request
) -> Dict[str, Any]:
    """Reject approval request.
    
    Checks if user has required role to reject.
    """
    await require_permission(request, "approval", "approve")
    user = await current_user(request)
    
    # Get approval request
    approval_request = await db.approval_requests.find_one(
        {"id": request_id},
        {"_id": 0}
    )
    if not approval_request:
        raise HTTPException(status_code=404, detail="Approval request tidak ditemukan")
    
    if approval_request["status"] != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reject request with status: {approval_request['status']}"
        )
    
    # Check if user has required role
    rule = await db.approval_rules.find_one(
        {"id": approval_request["rule_id"]},
        {"_id": 0}
    )
    
    if not rule:
        raise HTTPException(status_code=404, detail="Approval rule tidak ditemukan")
    
    if user["role"] != rule["approver_role"] and user["role"] != "admin":
        raise HTTPException(
            status_code=403,
            detail=f"Only {rule['approver_role']} or admin can reject this request"
        )
    
    # Reject request
    try:
        updated = await approval_service.reject_request(
            request_id,
            user["email"],
            payload.reason
        )
        
        # Audit log
        await audit(
            user.get("name", ""),
            "approval_request_rejected",
            "approval_request",
            request_id,
            {
                "entity_type": approval_request["entity_type"],
                "entity_id": approval_request["entity_id"],
                "entity_number": approval_request["entity_number"],
                "reason": payload.reason
            }
        )
        
        return updated
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
