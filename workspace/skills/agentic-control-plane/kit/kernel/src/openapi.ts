/**
 * OpenAPI 3.0 specification generator
 */

import { ActionDef } from './types';

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, any>;
  components?: {
    schemas?: Record<string, any>;
  };
}

export function generateOpenAPI(
  actions: ActionDef[],
  baseUrl: string = 'https://api.example.com'
): OpenAPISpec {
  const spec: OpenAPISpec = {
    openapi: '3.0.0',
    info: {
      title: 'Control Plane API',
      version: '1.0.0',
      description: 'Agentic control plane API for multi-tenant SaaS platforms'
    },
    paths: {
      '/manage': {
        post: {
          summary: 'Execute management action',
          operationId: 'executeAction',
          security: [
            {
              ApiKeyAuth: []
            }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['action'],
                  properties: {
                    action: {
                      type: 'string',
                      enum: actions.map(a => a.name),
                      description: 'Action to execute'
                    },
                    params: {
                      type: 'object',
                      description: 'Action-specific parameters'
                    },
                    idempotency_key: {
                      type: 'string',
                      description: 'Optional idempotency key for safe retries'
                    },
                    dry_run: {
                      type: 'boolean',
                      default: false,
                      description: 'If true, compute impact without persisting changes'
                    }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      request_id: { type: 'string' },
                      data: { type: 'object' },
                      dry_run: { type: 'boolean' },
                      constraints_applied: {
                        type: 'array',
                        items: { type: 'string' }
                      }
                    }
                  }
                }
              }
            },
            '400': {
              description: 'Validation error',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse'
                  }
                }
              }
            },
            '403': {
              description: 'Scope denied',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse'
                  }
                }
              }
            },
            '429': {
              description: 'Rate limited',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse'
                  }
                }
              }
            },
            '500': {
              description: 'Internal error',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse'
                  }
                }
              }
            }
          }
        }
      }
    },
    components: {
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean', example: false },
            request_id: { type: 'string' },
            error: { type: 'string' },
            code: {
              type: 'string',
              enum: [
                'SCOPE_DENIED',
                'VALIDATION_ERROR',
                'NOT_FOUND',
                'RATE_LIMITED',
                'CEILING_EXCEEDED',
                'IDEMPOTENT_REPLAY',
                'ADMIN_REQUIRED',
                'INTERNAL_ERROR'
              ]
            }
          }
        }
      },
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key'
        }
      }
    }
  };

  // Add action-specific schemas
  for (const action of actions) {
    const schemaName = action.name.replace(/\./g, '_');
    spec.components!.schemas![`${schemaName}Params`] = action.params_schema;
  }

  return spec;
}

export function writeOpenAPISpec(spec: OpenAPISpec, outputPath: string): void {
  // In actual implementation, this would write to filesystem
  // For now, just return the JSON string
  const json = JSON.stringify(spec, null, 2);
  // Would use fs.writeFileSync in Node.js environment
  return;
}
