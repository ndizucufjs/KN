"""Unified Approval Service

Configurable approval system untuk semua entity types.
Supports threshold-based rules dan role-based approvals.
"""
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from db import db
from core_utils import new_id, now_iso

# ─── Approval Rules Management ────────────────────────────────────────────────────

async def create_approval_rule(
    name: str,
    entity_type: str,
    threshold_field: str,
    threshold_operator: str,
    threshold_value: float,
    approver_role: str,
    description: str = "",
    priority: int = 100,
    is_active: bool = True,
    created_by: str = "system",
    entity_id: str = "all"
) -> Dict[str, Any]:
    """Create new approval rule.
    
    Args:
        name: Rule name
        entity_type: Entity type (special_order, purchase_order, transfer, etc)
        threshold_field: Field to check (total_amount, quantity, discount_percentage)
        threshold_operator: Comparison operator (gt, gte, lt, lte, eq)
        threshold_value: Threshold value
        approver_role: Role yang dapat approve (manager, admin, owner)
        description: Rule description
        priority: Rule priority (lower = higher priority)
        is_active: Is rule active
        created_by: Creator email
    
    Returns:
        Created approval rule
    """
    rule_id = new_id("appr")
    
    rule = {
        "id": rule_id,
        "entity_id": entity_id or "all",   # FASE E-0 — aturan per entitas (default: warisan grup)
        "name": name,
        "entity_type": entity_type,
        "description": description,
        
        # Threshold config
        "threshold_field": threshold_field,
        "threshold_operator": threshold_operator,  # gt, gte, lt, lte, eq
        "threshold_value": threshold_value,
        
        # Approver config
        "approver_role": approver_role,
        
        # Settings
        "priority": priority,
        "is_active": is_active,
        
        # Metadata
        "created_at": now_iso(),
        "created_by": created_by,
        "updated_at": now_iso()
    }
    
    await db.approval_rules.insert_one(rule)
    rule.pop("_id", None)
    return rule


async def get_approval_rules(
    entity_type: Optional[str] = None,
    is_active: Optional[bool] = None,
    entity_ids: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """Get approval rules with optional filters.

    FASE E-0 (L15/L17) — `approval_rules` kini terdaftar SCOPED. `entity_ids`
    menyaring aturan milik entitas tersebut **plus** aturan bawaan grup
    (`entity_id="all"`/kosong) yang berlaku sebagai warisan.
    """
    query: Dict[str, Any] = {}
    if entity_type:
        query["entity_type"] = entity_type
    if is_active is not None:
        query["is_active"] = is_active
    if entity_ids:
        query["$or"] = [{"entity_id": {"$in": list(entity_ids)}},
                        {"entity_id": "all"}, {"entity_id": None},
                        {"entity_id": {"$exists": False}}]
    
    rules = await db.approval_rules.find(
        query,
        {"_id": 0}
    ).sort("priority", 1).to_list(1000)
    
    return rules


async def update_approval_rule(
    rule_id: str,
    updates: Dict[str, Any]
) -> Dict[str, Any]:
    """Update approval rule."""
    updates["updated_at"] = now_iso()
    
    result = await db.approval_rules.find_one_and_update(
        {"id": rule_id},
        {"$set": updates},
        return_document=True
    )
    
    if not result:
        raise ValueError(f"Approval rule {rule_id} not found")
    
    result.pop("_id", None)
    return result


async def delete_approval_rule(rule_id: str) -> bool:
    """Soft delete approval rule (set is_active=False)."""
    result = await db.approval_rules.update_one(
        {"id": rule_id},
        {"$set": {"is_active": False, "updated_at": now_iso()}}
    )
    
    return result.modified_count > 0


# ─── Approval Evaluation ────────────────────────────────────────────────────────

def _evaluate_threshold(
    value: Any,
    operator: str,
    threshold: float
) -> bool:
    """Evaluate threshold condition."""
    try:
        value = float(value)
    except (ValueError, TypeError):
        return False
    
    if operator == "gt":
        return value > threshold
    elif operator == "gte":
        return value >= threshold
    elif operator == "lt":
        return value < threshold
    elif operator == "lte":
        return value <= threshold
    elif operator == "eq":
        return value == threshold
    else:
        return False


async def check_approval_required(
    entity_type: str,
    entity_data: Dict[str, Any]
) -> tuple[bool, Optional[Dict[str, Any]]]:
    """Check if approval is required for entity.
    
    Args:
        entity_type: Type of entity (special_order, purchase_order, etc)
        entity_data: Entity data to evaluate
    
    Returns:
        (requires_approval: bool, matched_rule: Optional[Dict])
    """
    # Get active rules for entity type, sorted by priority
    rules = await get_approval_rules(entity_type=entity_type, is_active=True)
    
    for rule in rules:
        threshold_field = rule["threshold_field"]
        threshold_operator = rule["threshold_operator"]
        threshold_value = rule["threshold_value"]
        
        # Get field value from entity data
        field_value = entity_data.get(threshold_field)
        
        if field_value is None:
            continue
        
        # Evaluate threshold
        if _evaluate_threshold(field_value, threshold_operator, threshold_value):
            return True, rule
    
    return False, None


# ─── Approval Requests Management ─────────────────────────────────────────────────

async def create_approval_request(
    entity_type: str,
    entity_id: str,
    entity_number: str,
    rule_id: str,
    requested_by: str,
    metadata: Dict[str, Any] = None
) -> Dict[str, Any]:
    """Create approval request.
    
    Args:
        entity_type: Entity type
        entity_id: Entity ID
        entity_number: Entity number (for display)
        rule_id: Matched approval rule ID
        requested_by: Requester email
        metadata: Additional metadata for display (customer_name, amount, etc)
    
    Returns:
        Created approval request
    """
    request_id = new_id("appreq")
    
    request = {
        "id": request_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "entity_number": entity_number,
        "rule_id": rule_id,
        
        "status": "pending",
        
        "requested_by": requested_by,
        "requested_at": now_iso(),
        
        "reviewed_by": None,
        "reviewed_at": None,
        "decision_notes": "",
        
        "metadata": metadata or {},
        
        "created_at": now_iso(),
        "updated_at": now_iso()
    }
    
    await db.approval_requests.insert_one(request)
    request.pop("_id", None)
    return request


async def get_approval_requests(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    status: Optional[str] = None,
    approver_role: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Get approval requests with filters.
    
    Args:
        entity_type: Filter by entity type
        entity_id: Filter by entity ID
        status: Filter by status (pending, approved, rejected)
        approver_role: Filter by approver role (for pending requests)
    
    Returns:
        List of approval requests with rule details
    """
    query = {}
    if entity_type:
        query["entity_type"] = entity_type
    if entity_id:
        query["entity_id"] = entity_id
    if status:
        query["status"] = status
    
    requests = await db.approval_requests.find(
        query,
        {"_id": 0}
    ).sort("requested_at", -1).to_list(1000)
    
    # Enrich with rule details
    if approver_role:
        # Filter by approver role from matched rules
        enriched = []
        for req in requests:
            rule = await db.approval_rules.find_one(
                {"id": req["rule_id"]},
                {"_id": 0}
            )
            if rule and rule.get("approver_role") == approver_role:
                req["rule"] = rule
                enriched.append(req)
        return enriched
    else:
        # Add rule details to all requests
        for req in requests:
            rule = await db.approval_rules.find_one(
                {"id": req["rule_id"]},
                {"_id": 0}
            )
            if rule:
                req["rule"] = rule
        return requests


async def approve_request(
    request_id: str,
    approved_by: str,
    notes: str = ""
) -> Dict[str, Any]:
    """Approve approval request.
    
    Args:
        request_id: Approval request ID
        approved_by: Approver email
        notes: Approval notes
    
    Returns:
        Updated approval request
    """
    result = await db.approval_requests.find_one_and_update(
        {"id": request_id, "status": "pending"},
        {
            "$set": {
                "status": "approved",
                "reviewed_by": approved_by,
                "reviewed_at": now_iso(),
                "decision_notes": notes,
                "updated_at": now_iso()
            }
        },
        return_document=True
    )
    
    if not result:
        raise ValueError(f"Approval request {request_id} not found or not pending")
    
    result.pop("_id", None)
    return result


async def reject_request(
    request_id: str,
    rejected_by: str,
    reason: str
) -> Dict[str, Any]:
    """Reject approval request.
    
    Args:
        request_id: Approval request ID
        rejected_by: Rejector email
        reason: Rejection reason
    
    Returns:
        Updated approval request
    """
    if not reason.strip():
        raise ValueError("Rejection reason is required")
    
    result = await db.approval_requests.find_one_and_update(
        {"id": request_id, "status": "pending"},
        {
            "$set": {
                "status": "rejected",
                "reviewed_by": rejected_by,
                "reviewed_at": now_iso(),
                "decision_notes": reason,
                "updated_at": now_iso()
            }
        },
        return_document=True
    )
    
    if not result:
        raise ValueError(f"Approval request {request_id} not found or not pending")
    
    result.pop("_id", None)
    return result


async def get_pending_approvals_count(approver_role: str) -> int:
    """Get count of pending approvals for a role.
    
    Args:
        approver_role: Role (manager, admin, owner)
    
    Returns:
        Count of pending approvals
    """
    # Get all pending requests
    pending = await db.approval_requests.count_documents({"status": "pending"})
    
    # Filter by role (need to check against rules)
    requests = await get_approval_requests(status="pending", approver_role=approver_role)
    
    return len(requests)
