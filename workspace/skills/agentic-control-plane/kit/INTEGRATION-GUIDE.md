# Integration Guide: Adding Agentic Control Plane to Lead Scoring SaaS

This guide shows how to integrate the `agentic-control-plane-kit` into the [lead scoring repo](https://github.com/acedge123/api-docs-template) (Django backend).

## Prerequisites

- Django backend with existing API endpoints
- Database with tenant isolation (likely using Django's multi-tenancy)
- API key authentication system (or ready to add one)

## Step A: Vendor the Kit

### Option 1: Copy Folder (Fastest for Early Stage)

```bash
# From lead-scoring repo root
cd /path/to/lead-scoring-repo
mkdir -p control-plane
cp -r /path/to/agentic-control-plane-kit/kernel ./control-plane/
cp -r /path/to/agentic-control-plane-kit/packs ./control-plane/
cp -r /path/to/agentic-control-plane-kit/config ./control-plane/
```

### Option 2: Git Subtree (Recommended for Production)

```bash
# Add the kit as a subtree
git subtree add --prefix=control-plane \
  https://github.com/your-org/agentic-control-plane-kit.git main --squash

# Later, update the kit:
git subtree pull --prefix=control-plane \
  https://github.com/your-org/agentic-control-plane-kit.git main --squash
```

### Option 3: Private npm Package (Later)

```bash
npm install @your-org/agentic-control-plane-kit --save
```

## Step B: Create Django `/manage` Endpoint

Create a new Django view that wraps the kit's router:

```python
# api/views/manage.py
import json
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from control_plane.kernel import createManageRouter
from control_plane.packs import iamPack, webhooksPack, settingsPack
from .adapters import (
    DjangoDbAdapter,
    DjangoAuditAdapter,
    DjangoIdempotencyAdapter,
    DjangoRateLimitAdapter,
    DjangoCeilingsAdapter
)
from .bindings import get_bindings

# Initialize router once (Django app startup)
_manage_router = None

def get_manage_router():
    global _manage_router
    if _manage_router is None:
        _manage_router = createManageRouter({
            'dbAdapter': DjangoDbAdapter(),
            'auditAdapter': DjangoAuditAdapter(),
            'idempotencyAdapter': DjangoIdempotencyAdapter(),
            'rateLimitAdapter': DjangoRateLimitAdapter(),
            'ceilingsAdapter': DjangoCeilingsAdapter(),
            'bindings': get_bindings(),
            'packs': [iamPack, webhooksPack, settingsPack, leadScoringDomainPack]
        })
    return _manage_router

@csrf_exempt
@require_http_methods(["POST"])
def manage_endpoint(request):
    """POST /api/manage - Control plane router"""
    try:
        body = json.loads(request.body)
        
        # Convert Django request to kit's RequestMeta format
        meta = {
            'request': request,  # Pass Django request for auth
            'ipAddress': get_client_ip(request),
            'userAgent': request.META.get('HTTP_USER_AGENT', '')
        }
        
        # Call router
        router = get_manage_router()
        response = await router(body, meta)
        
        # Convert kit response to Django response
        return JsonResponse(
            json.loads(response.body),
            status=response.status or 200
        )
    except Exception as e:
        return JsonResponse(
            {'ok': False, 'error': str(e)},
            status=500
        )

def get_client_ip(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip
```

Add to `urls.py`:

```python
# api/urls.py
from django.urls import path
from .views.manage import manage_endpoint

urlpatterns = [
    path('manage', manage_endpoint, name='manage'),
    # ... other routes
]
```

## Step C: Implement Django Adapters

The kit defines interfaces. You implement them for Django:

### 1. Database Adapter

```python
# api/adapters/db.py
from control_plane.kernel.src.types import DbAdapter
from django.db import connection
from scoringengine.models import Tenant, ApiKey, ScoringModel, ScoringRule

class DjangoDbAdapter(DbAdapter):
    """Django ORM adapter for control plane"""
    
    async def query(self, sql, params=None):
        with connection.cursor() as cursor:
            cursor.execute(sql, params or [])
            columns = [col[0] for col in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]
    
    async def queryOne(self, sql, params=None):
        results = await self.query(sql, params)
        return results[0] if results else None
    
    async def execute(self, sql, params=None):
        with connection.cursor() as cursor:
            cursor.execute(sql, params or [])
            return cursor.rowcount
    
    async def getTenantFromApiKey(self, api_key_id):
        try:
            key = ApiKey.objects.get(id=api_key_id)
            return str(key.tenant_id)
        except ApiKey.DoesNotExist:
            return None
    
    async def isPlatformAdmin(self, tenant_id):
        tenant = Tenant.objects.get(id=tenant_id)
        return tenant.is_platform_admin
    
    # IAM pack methods
    async def listApiKeys(self, tenant_id):
        keys = ApiKey.objects.filter(tenant_id=tenant_id)
        return [self._serialize_api_key(k) for k in keys]
    
    async def createApiKey(self, tenant_id, data):
        key = ApiKey.objects.create(
            tenant_id=tenant_id,
            name=data.get('name'),
            scopes=data['scopes'],
            expires_at=data.get('expires_at')
        )
        return self._serialize_api_key(key)
    
    # Lead scoring domain methods (for domain pack)
    async def listScoringModels(self, tenant_id):
        models = ScoringModel.objects.filter(tenant_id=tenant_id)
        return [self._serialize_model(m) for m in models]
    
    async def updateScoringRule(self, tenant_id, rule_id, data):
        rule = ScoringRule.objects.get(id=rule_id, tenant_id=tenant_id)
        # Update fields...
        rule.save()
        return self._serialize_rule(rule)
    
    def _serialize_api_key(self, key):
        return {
            'id': str(key.id),
            'tenant_id': str(key.tenant_id),
            'key_prefix': key.prefix,
            'name': key.name,
            'scopes': key.scopes,
            'created_at': key.created_at.isoformat(),
            'expires_at': key.expires_at.isoformat() if key.expires_at else None
        }
    
    # ... other serialization methods
```

### 2. Audit Adapter

```python
# api/adapters/audit.py
from control_plane.kernel.src.types import AuditAdapter, AuditEntry
from scoringengine.models import AuditLog

class DjangoAuditAdapter(AuditAdapter):
    async def log(self, entry: AuditEntry):
        AuditLog.objects.create(
            tenant_id=entry['tenantId'],
            actor_type=entry['actorType'],
            actor_id=entry['actorId'],
            api_key_id=entry.get('apiKeyId'),
            action=entry['action'],
            request_id=entry['requestId'],
            payload_hash=entry.get('payloadHash'),
            before_snapshot=entry.get('beforeSnapshot'),
            after_snapshot=entry.get('afterSnapshot'),
            impact=entry.get('impact'),
            result=entry['result'],
            error_message=entry.get('errorMessage'),
            ip_address=entry.get('ipAddress'),
            idempotency_key=entry.get('idempotencyKey'),
            dry_run=entry['dryRun']
        )
```

### 3. Other Adapters

```python
# api/adapters/idempotency.py
from control_plane.kernel.src.types import IdempotencyAdapter
from django.core.cache import cache

class DjangoIdempotencyAdapter(IdempotencyAdapter):
    async def getReplay(self, tenant_id, action, idempotency_key):
        key = f"idempotency:{tenant_id}:{action}:{idempotency_key}"
        return cache.get(key)
    
    async def storeReplay(self, tenant_id, action, idempotency_key, response):
        key = f"idempotency:{tenant_id}:{action}:{idempotency_key}"
        cache.set(key, response, timeout=86400)  # 24 hours

# api/adapters/rate_limit.py
from control_plane.kernel.src.types import RateLimitAdapter
from django.core.cache import cache

class DjangoRateLimitAdapter(RateLimitAdapter):
    async def check(self, api_key_id, action, limit):
        key = f"ratelimit:{api_key_id}:{action}"
        count = cache.get(key, 0)
        allowed = count < limit
        
        if allowed:
            cache.set(key, count + 1, timeout=60)  # 1 minute window
        
        return {
            'allowed': allowed,
            'limit': limit,
            'remaining': max(0, limit - count - 1)
        }

# api/adapters/ceilings.py
from control_plane.kernel.src.types import CeilingsAdapter
from scoringengine.models import Tenant

class DjangoCeilingsAdapter(CeilingsAdapter):
    async def check(self, action, params, tenant_id):
        tenant = Tenant.objects.get(id=tenant_id)
        
        # Example: Check max scoring models per tenant
        if action == 'domain.leadscoring.models.create':
            current_count = ScoringModel.objects.filter(tenant_id=tenant_id).count()
            if current_count >= tenant.max_scoring_models:
                raise Exception(f"Ceiling exceeded: max {tenant.max_scoring_models} scoring models")
        
        # Add other ceiling checks...
    
    async def getUsage(self, ceiling_name, tenant_id, period=None):
        # Return current usage for a ceiling
        pass
```

## Step D: Create Lead Scoring Domain Pack

This is where your product-specific actions live:

```python
# api/packs/leadscoring/actions.py
from control_plane.kernel.src.types import ActionDef

leadScoringActions = [
    {
        'name': 'domain.leadscoring.models.list',
        'scope': 'manage.read',
        'description': 'List all scoring models for the tenant',
        'params_schema': {
            'type': 'object',
            'properties': {}
        },
        'supports_dry_run': False
    },
    {
        'name': 'domain.leadscoring.models.create',
        'scope': 'manage.domain',
        'description': 'Create a new scoring model',
        'params_schema': {
            'type': 'object',
            'properties': {
                'name': {'type': 'string'},
                'description': {'type': 'string'},
                'model_type': {'type': 'string', 'enum': ['linear', 'ml', 'rule_based']}
            },
            'required': ['name', 'model_type']
        },
        'supports_dry_run': True
    },
    {
        'name': 'domain.leadscoring.rules.update',
        'scope': 'manage.domain',
        'description': 'Update scoring rules (requires dry-run)',
        'params_schema': {
            'type': 'object',
            'properties': {
                'rule_id': {'type': 'string'},
                'weight': {'type': 'number'},
                'conditions': {'type': 'object'}
            },
            'required': ['rule_id']
        },
        'supports_dry_run': True  # Required for safety
    },
    {
        'name': 'domain.leadscoring.scores.recompute',
        'scope': 'manage.domain',
        'description': 'Recompute scores for all leads (idempotent)',
        'params_schema': {
            'type': 'object',
            'properties': {
                'model_id': {'type': 'string'},
                'lead_ids': {'type': 'array', 'items': {'type': 'string'}}
            },
            'required': ['model_id']
        },
        'supports_dry_run': False
    },
    {
        'name': 'domain.leadscoring.leads.export',
        'scope': 'manage.read',
        'description': 'Export leads with scores to CSV',
        'params_schema': {
            'type': 'object',
            'properties': {
                'model_id': {'type': 'string'},
                'filters': {'type': 'object'}
            },
            'required': ['model_id']
        },
        'supports_dry_run': False
    }
]
```

```python
# api/packs/leadscoring/handlers.py
from control_plane.kernel.src.types import ActionHandler, ImpactShape
from scoringengine.models import ScoringModel, ScoringRule, Lead

async def handleModelsList(params, ctx):
    models = await ctx.db.listScoringModels(ctx.tenantId)
    return {'data': models}

async def handleModelsCreate(params, ctx):
    if ctx.dryRun:
        impact = {
            'creates': [{'type': 'scoring_model', 'count': 1}],
            'updates': [],
            'deletes': [],
            'side_effects': [],
            'risk': 'low',
            'warnings': []
        }
        return {'data': {'model_id': 'preview', ...params}, 'impact': impact}
    
    model = await ctx.db.createScoringModel(ctx.tenantId, params)
    impact = {
        'creates': [{'type': 'scoring_model', 'count': 1, 'details': {'id': model.id}}],
        'updates': [],
        'deletes': [],
        'side_effects': [],
        'risk': 'low',
        'warnings': []
    }
    return {'data': model, 'impact': impact}

async def handleRulesUpdate(params, ctx):
    # Always require dry-run for rule updates
    if not ctx.dryRun:
        raise Exception('Rule updates require dry_run=true for safety')
    
    # ... update logic
    impact = {
        'creates': [],
        'updates': [{'type': 'scoring_rule', 'id': params['rule_id'], 'fields': ['weight', 'conditions']}],
        'deletes': [],
        'side_effects': [{'type': 'score_recompute', 'count': 1}],
        'risk': 'medium',
        'warnings': ['This will trigger score recomputation for affected leads']
    }
    return {'data': {...}, 'impact': impact}

async def handleScoresRecompute(params, ctx):
    # Idempotent operation - safe to retry
    model_id = params['model_id']
    lead_ids = params.get('lead_ids', [])
    
    # Recompute logic...
    return {'data': {'recomputed': len(lead_ids), 'model_id': model_id}}

async def handleLeadsExport(params, ctx):
    # Export logic...
    return {'data': {'export_url': 'https://...', 'record_count': 1000}}
```

```python
# api/packs/leadscoring/index.py
from control_plane.kernel.src.pack import Pack
from .actions import leadScoringActions
from .handlers import (
    handleModelsList,
    handleModelsCreate,
    handleRulesUpdate,
    handleScoresRecompute,
    handleLeadsExport
)

leadScoringDomainPack = Pack(
    name='leadscoring',
    actions=leadScoringActions,
    handlers={
        'domain.leadscoring.models.list': handleModelsList,
        'domain.leadscoring.models.create': handleModelsCreate,
        'domain.leadscoring.rules.update': handleRulesUpdate,
        'domain.leadscoring.scores.recompute': handleScoresRecompute,
        'domain.leadscoring.leads.export': handleLeadsExport
    }
)
```

## Step E: Create Bindings Configuration

```python
# api/bindings.py
def get_bindings():
    return {
        'tenant': {
            'table': 'tenants',
            'id_column': 'id',
            'get_tenant_fn': 'get_tenant_id',
            'is_admin_fn': 'is_platform_admin'
        },
        'auth': {
            'keys_table': 'api_keys',
            'key_prefix': 'lsk_',  # Lead Scoring Key prefix
            'prefix_length': 12,
            'key_hash_column': 'key_hash',
            'key_prefix_column': 'prefix',
            'scopes_column': 'scopes'
        },
        'database': {
            'adapter': 'django',
            'connection': 'default'
        },
        'scopes': {
            'base_scopes': ['manage.read'],
            'pack_scopes': {
                'iam': ['manage.iam'],
                'webhooks': ['manage.webhooks'],
                'settings': ['manage.settings'],
                'leadscoring': ['manage.domain']
            }
        },
        'action_namespace': ''  # No prefix needed
    }
```

## Step F: Database Migrations

Add tables for audit log and idempotency:

```python
# scoringengine/migrations/XXXX_add_control_plane_tables.py
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('scoringengine', 'XXXX_previous_migration'),
    ]

    operations = [
        migrations.CreateModel(
            name='AuditLog',
            fields=[
                ('id', models.AutoField(primary_key=True)),
                ('tenant_id', models.UUIDField()),
                ('actor_type', models.CharField(max_length=20)),
                ('actor_id', models.CharField(max_length=255)),
                ('api_key_id', models.UUIDField(null=True)),
                ('action', models.CharField(max_length=255)),
                ('request_id', models.CharField(max_length=255)),
                ('payload_hash', models.CharField(max_length=64, null=True)),
                ('before_snapshot', models.JSONField(null=True)),
                ('after_snapshot', models.JSONField(null=True)),
                ('impact', models.JSONField(null=True)),
                ('result', models.CharField(max_length=20)),
                ('error_message', models.TextField(null=True)),
                ('ip_address', models.GenericIPAddressField(null=True)),
                ('idempotency_key', models.CharField(max_length=255, null=True)),
                ('dry_run', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'audit_log',
                'indexes': [
                    models.Index(fields=['tenant_id', 'created_at']),
                    models.Index(fields=['action', 'created_at']),
                    models.Index(fields=['request_id']),
                ],
            },
        ),
    ]
```

## Step G: Test Integration

```python
# api/tests/test_manage_endpoint.py
from django.test import TestCase, Client
import json

class ManageEndpointTest(TestCase):
    def setUp(self):
        self.client = Client()
        # Create test tenant and API key...
    
    def test_meta_actions(self):
        """Test meta.actions discovery"""
        response = self.client.post(
            '/api/manage',
            json.dumps({'action': 'meta.actions'}),
            content_type='application/json',
            HTTP_X_API_KEY='lsk_test123456'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertTrue(data['ok'])
        self.assertIn('actions', data['data'])
    
    def test_dry_run_prevents_writes(self):
        """Test dry-run doesn't create resources"""
        response = self.client.post(
            '/api/manage',
            json.dumps({
                'action': 'domain.leadscoring.models.create',
                'params': {'name': 'Test Model', 'model_type': 'linear'},
                'dry_run': True
            }),
            content_type='application/json',
            HTTP_X_API_KEY='lsk_test123456'
        )
        self.assertEqual(response.status_code, 200)
        # Verify no model was created...
    
    def test_idempotency_replay(self):
        """Test idempotency key replay"""
        idempotency_key = 'test-key-123'
        
        # First request
        response1 = self.client.post(
            '/api/manage',
            json.dumps({
                'action': 'domain.leadscoring.models.create',
                'params': {'name': 'Test', 'model_type': 'linear'},
                'idempotency_key': idempotency_key
            }),
            content_type='application/json',
            HTTP_X_API_KEY='lsk_test123456'
        )
        
        # Second request (should replay)
        response2 = self.client.post(
            '/api/manage',
            json.dumps({
                'action': 'domain.leadscoring.models.create',
                'params': {'name': 'Test', 'model_type': 'linear'},
                'idempotency_key': idempotency_key
            }),
            content_type='application/json',
            HTTP_X_API_KEY='lsk_test123456'
        )
        
        self.assertEqual(response2.status_code, 200)
        data2 = json.loads(response2.content)
        self.assertEqual(data2['code'], 'IDEMPOTENT_REPLAY')
```

## Step H: Generate OpenAPI Spec

```bash
# Add to package.json or run directly
cd control-plane
npm run generate:openapi

# Output: public/api/openapi.json
# This becomes your agent's "instruction manual"
```

## What You Get

Once integrated, your lead scoring SaaS now has:

✅ **Consistent `/manage` API** - Same contract as Onsite Affiliate  
✅ **Agent-ready actions** - Edge Bot can operate your product programmatically  
✅ **Safety rails** - Audit, idempotency, rate limits, ceilings built-in  
✅ **Domain actions** - Lead scoring-specific operations (models, rules, scores)  
✅ **Self-discovery** - `meta.actions` endpoint lists all capabilities  

## Next Steps

1. **Deploy** the `/manage` endpoint
2. **Connect Edge Bot** to the lead scoring repo (same pattern as Onsite Affiliate)
3. **Test** with `meta.actions` to see available operations
4. **Extend** domain pack as you add new features

## The Flywheel Effect

Once both repos share the kit:

- **Improvements in one place** (e.g., better idempotency) upgrade both products
- **Agents become multi-product operators**: "Rotate keys across all tenants", "Audit suspicious activity"
- **New products** get control plane in hours, not days

---

**Questions?** See the [MASTER-BLUEPRINT.md](./MASTER-BLUEPRINT.md) for complete specification.
