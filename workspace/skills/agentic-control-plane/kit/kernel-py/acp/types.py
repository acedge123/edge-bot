"""
ACP types — mirrors spec/ (request, response, action def, impact, audit)
"""

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional

# Request envelope (spec/request.json)
ManageRequest = Dict[str, Any]  # action, params?, idempotency_key?, dry_run?

# Response envelope (spec/response.json)
ManageResponse = Dict[str, Any]  # ok, request_id, data?, error?, code?, ...


@dataclass
class ActionDef:
    """Action definition — spec/action-def.json"""
    name: str
    scope: str
    description: str
    params_schema: Dict[str, Any]
    supports_dry_run: bool


@dataclass
class ImpactShape:
    """Dry-run impact — spec/impact.json"""
    creates: List[Dict[str, Any]]
    updates: List[Dict[str, Any]]
    deletes: List[Dict[str, Any]]
    side_effects: List[Dict[str, Any]]
    risk: str  # low | medium | high
    warnings: List[str]
    estimated_cost: Optional[float] = None
    requires_approval: Optional[bool] = None


@dataclass
class AuditEntry:
    """Audit log entry — spec/audit-entry.json"""
    tenant_id: str
    actor_type: str  # api_key | user | system
    actor_id: str
    action: str
    request_id: str
    result: str  # success | denied | error
    dry_run: bool
    api_key_id: Optional[str] = None
    payload_hash: Optional[str] = None
    before_snapshot: Optional[Any] = None
    after_snapshot: Optional[Any] = None
    impact: Optional[ImpactShape] = None
    error_message: Optional[str] = None
    ip_address: Optional[str] = None
    idempotency_key: Optional[str] = None


# Error codes — spec/error-codes.json
ERROR_CODES = [
    "VALIDATION_ERROR",
    "INVALID_API_KEY",
    "SCOPE_DENIED",
    "NOT_FOUND",
    "RATE_LIMITED",
    "CEILING_EXCEEDED",
    "IDEMPOTENT_REPLAY",
    "INTERNAL_ERROR",
]
