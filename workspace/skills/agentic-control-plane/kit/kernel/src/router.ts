/**
 * Main /manage router implementation
 * Pure function that returns a request handler
 */

import {
  ManageRequest,
  ManageResponse,
  ActionDef,
  ActionHandler,
  ActionContext,
  KernelConfig,
  ImpactShape
} from './types';
import { validateRequest, validateParams, ValidationError } from './validate';
import { validateApiKey, hasScope } from './auth';
import { generateRequestId, logAudit, hashPayload } from './audit';
import { getIdempotencyReplay, storeIdempotencyReplay } from './idempotency';
import { checkRateLimit, getActionRateLimit } from './rate_limit';
import { applyCeilings } from './ceilings';
import { Pack, mergePacks, validatePack } from './pack';
import { getMetaPack, setGlobalActionRegistry } from './meta-pack';

export interface RequestMeta {
  request?: Request; // Raw HTTP request for auth validation
  ipAddress?: string;
  userAgent?: string;
  [key: string]: any;
}

export interface ManageRouter {
  (req: ManageRequest, meta?: RequestMeta): Promise<ManageResponse>;
}

export function createManageRouter(config: KernelConfig & { packs: Pack[] }): ManageRouter {
  const {
    dbAdapter,
    auditAdapter,
    idempotencyAdapter,
    rateLimitAdapter,
    ceilingsAdapter,
    bindings
  } = config;

  // Merge all packs (including meta pack)
  const metaPack = getMetaPack();
  const allPacks = [metaPack, ...config.packs];
  const { actions: allActions, handlers: allHandlers } = mergePacks(allPacks);
  
  // Set global registry for meta.actions
  setGlobalActionRegistry(allActions);
  
  // Build action registry map
  const actionRegistry = new Map<string, { def: ActionDef; handler: ActionHandler }>();
  for (const action of allActions) {
    actionRegistry.set(action.name, {
      def: action,
      handler: allHandlers[action.name]
    });
  }
  
  // Build scope map from actions
  const actionScopeMap: Record<string, string> = {};
  for (const action of allActions) {
    actionScopeMap[action.name] = action.scope;
  }

  return async (req: ManageRequest, meta: RequestMeta = {}): Promise<ManageResponse> => {
    const requestId = generateRequestId();
    let tenantId: string | undefined;
    let apiKeyId: string | undefined;
    let scopes: string[] = [];
    let keyPrefix: string | undefined;

    try {
      // 1. Validate request schema
      validateRequest(req);
    } catch (error) {
      if (error instanceof ValidationError) {
        return {
          ok: false,
          request_id: requestId,
          error: error.message,
          code: 'VALIDATION_ERROR'
        };
      }
      throw error;
    }

    const { action, params = {}, idempotency_key, dry_run = false } = req;

    // 2. Authenticate via API key
    if (!meta.request) {
      return {
        ok: false,
        request_id: requestId,
        error: 'Request object required for authentication',
        code: 'INVALID_API_KEY'
      };
    }

    const authResult = await validateApiKey(meta.request, dbAdapter, bindings);
    
    if (!authResult.success) {
      await logAudit(auditAdapter, {
        tenantId: '',
        actorType: 'api_key',
        actorId: 'unknown',
        action,
        requestId,
        result: 'error',
        errorMessage: authResult.error || 'Authentication failed',
        ipAddress: meta.ipAddress,
        dryRun: dry_run
      });

      return {
        ok: false,
        request_id: requestId,
        error: authResult.error || 'Authentication failed',
        code: 'INVALID_API_KEY'
      };
    }

    tenantId = authResult.tenantId!;
    apiKeyId = authResult.apiKeyId!;
    scopes = authResult.scopes || [];
    keyPrefix = authResult.keyPrefix;

    // 3. Lookup action in registry
    const actionEntry = actionRegistry.get(action);
    if (!actionEntry) {
      await logAudit(auditAdapter, {
        tenantId: tenantId!,
        actorType: 'api_key',
        actorId: keyPrefix || 'unknown',
        apiKeyId,
        action,
        requestId,
        result: 'error',
        errorMessage: `Unknown action: ${action}`,
        ipAddress: meta.ipAddress,
        dryRun: dry_run
      });

      return {
        ok: false,
        request_id: requestId,
        error: `Unknown action: ${action}`,
        code: 'NOT_FOUND'
      };
    }

    const { def: actionDef, handler } = actionEntry;

    // 4. Enforce dry_run support check
    // If action is a mutation (supports_dry_run exists) but doesn't support dry_run, reject
    if (dry_run && !actionDef.supports_dry_run) {
      await logAudit(auditAdapter, {
        tenantId: tenantId!,
        actorType: 'api_key',
        actorId: keyPrefix || 'unknown',
        apiKeyId,
        action,
        requestId,
        result: 'error',
        errorMessage: `Action ${action} does not support dry_run mode`,
        ipAddress: meta.ipAddress,
        dryRun: dry_run
      });

      return {
        ok: false,
        request_id: requestId,
        error: `Action ${action} does not support dry_run mode`,
        code: 'VALIDATION_ERROR'
      };
    }

    // 5. Scope check (deny-by-default)
    const requiredScope = actionScopeMap[action] || actionDef.scope;
    if (requiredScope && !hasScope(scopes, requiredScope)) {
      await logAudit(auditAdapter, {
        tenantId: tenantId!,
        actorType: 'api_key',
        actorId: keyPrefix || 'unknown',
        apiKeyId,
        action,
        requestId,
        result: 'denied',
        errorMessage: `Insufficient scope: requires '${requiredScope}'`,
        ipAddress: meta.ipAddress,
        dryRun: dry_run
      });

      return {
        ok: false,
        request_id: requestId,
        error: `Insufficient scope: action '${action}' requires '${requiredScope}'`,
        code: 'SCOPE_DENIED'
      };
    }

    // 6. Rate limit: per-key + per-action
    const defaultRateLimit = 1000; // Should come from API key config
    const actionRateLimit = getActionRateLimit(action, defaultRateLimit);
    const effectiveLimit = Math.min(defaultRateLimit, actionRateLimit);

    const rateLimitResult = await checkRateLimit(
      rateLimitAdapter,
      apiKeyId,
      action,
      effectiveLimit
    );

    if (!rateLimitResult.allowed) {
      await logAudit(auditAdapter, {
        tenantId: tenantId!,
        actorType: 'api_key',
        actorId: keyPrefix || 'unknown',
        apiKeyId,
        action,
        requestId,
        result: 'denied',
        errorMessage: `Rate limit exceeded: ${rateLimitResult.limit} requests per minute`,
        ipAddress: meta.ipAddress,
        dryRun: dry_run
      });

      return {
        ok: false,
        request_id: requestId,
        error: `Rate limit exceeded: ${rateLimitResult.limit} requests per minute`,
        code: 'RATE_LIMITED'
      };
    }

    // 7. Ceilings check for mutations
    if (!dry_run && actionDef.supports_dry_run) {
      try {
        await applyCeilings(ceilingsAdapter, action, params, tenantId!);
      } catch (error: any) {
        return {
          ok: false,
          request_id: requestId,
          error: error.message || 'Ceiling exceeded',
          code: 'CEILING_EXCEEDED'
        };
      }
    }

    // 8. Idempotency replay for non-dry-run mutations
    if (idempotency_key && !dry_run) {
      const replay = await getIdempotencyReplay(
        idempotencyAdapter,
        tenantId!,
        action,
        idempotency_key
      );

      if (replay) {
        await logAudit(auditAdapter, {
          tenantId: tenantId!,
          actorType: 'api_key',
          actorId: keyPrefix || 'unknown',
          apiKeyId,
          action,
          requestId,
          result: 'success',
          idempotencyKey: idempotency_key,
          ipAddress: meta.ipAddress,
          dryRun: false
        });

        // Idempotency adapter should store the handler "data" payload.
        // However, callers/tests may have stored a full response shape ({ ok, data }).
        // Normalize to always return the underlying data object.
        const replayData = (replay as any)?.data !== undefined ? (replay as any).data : replay;

        return {
          ok: true,
          request_id: requestId,
          data: replayData,
          code: 'IDEMPOTENT_REPLAY'
        };
      }
    }

    // 9. Validate params against action schema
    try {
      validateParams(actionDef, params);
    } catch (error) {
      if (error instanceof ValidationError) {
        await logAudit(auditAdapter, {
          tenantId: tenantId!,
          actorType: 'api_key',
          actorId: keyPrefix || 'unknown',
          apiKeyId,
          action,
          requestId,
          result: 'error',
          errorMessage: error.message,
          ipAddress: meta.ipAddress,
          dryRun: dry_run
        });

        return {
          ok: false,
          request_id: requestId,
          error: error.message,
          code: 'VALIDATION_ERROR'
        };
      }
      throw error;
    }

    // 10. If dry_run: call handler with dryRun=true, require impact object
    // 11. Execute handler
    let result: any;
    let impact: ImpactShape | null = null;
    let beforeSnapshot: any = null;
    let afterSnapshot: any = null;

    try {
      const ctx: ActionContext = {
        tenantId: tenantId!,
        apiKeyId,
        scopes,
        dryRun: dry_run,
        requestId,
        db: dbAdapter,
        audit: auditAdapter,
        idempotency: idempotencyAdapter,
        rateLimit: rateLimitAdapter,
        ceilings: ceilingsAdapter,
        bindings,
        meta: meta
      };

      if (dry_run) {
        // Dry-run: handler should return { data, impact }
        const handlerResult = await handler(params, ctx);
        if (!handlerResult || !handlerResult.impact) {
          throw new Error('Dry-run handler must return { data, impact } with impact shape');
        }
        impact = handlerResult.impact;
        // For dry-run, return the impact shape as the main data
        result = impact;
      } else {
        // Real execution: handler returns { data, impact }
        const handlerResult = await handler(params, ctx);
        impact = handlerResult.impact || null;
        // Extract data for response
        result = handlerResult.data !== undefined ? handlerResult.data : handlerResult;
      }
    } catch (error: any) {
      await logAudit(auditAdapter, {
        tenantId: tenantId!,
        actorType: 'api_key',
        actorId: keyPrefix || 'unknown',
        apiKeyId,
        action,
        requestId,
        result: 'error',
        errorMessage: error.message,
        ipAddress: meta.ipAddress,
        dryRun: dry_run
      });

      return {
        ok: false,
        request_id: requestId,
        error: error.message || 'Internal error',
        code: 'INTERNAL_ERROR'
      };
    }

    // 12. Write audit log ALWAYS
    await logAudit(auditAdapter, {
      tenantId: tenantId!,
      actorType: 'api_key',
      actorId: keyPrefix || 'unknown',
      apiKeyId,
      action,
      requestId,
      payloadHash: hashPayload(JSON.stringify(req)),
      beforeSnapshot,
      afterSnapshot,
      impact: impact || undefined,
      result: 'success',
      idempotencyKey: idempotency_key,
      ipAddress: meta.ipAddress,
      dryRun: dry_run
    });

    // 13. Store idempotency result for non-dry-run mutations
    if (idempotency_key && !dry_run) {
      await storeIdempotencyReplay(
        idempotencyAdapter,
        tenantId!,
        action,
        idempotency_key,
        result
      );
    }

    // Return response
    const response: ManageResponse = {
      ok: true,
      request_id: requestId,
      data: result,
      dry_run: dry_run,
      constraints_applied: [
        `tenant_scoped: ${tenantId}`,
        `rate_limit: ${rateLimitResult.remaining}/${rateLimitResult.limit} remaining`
      ]
    };

    return response;
  };
}
