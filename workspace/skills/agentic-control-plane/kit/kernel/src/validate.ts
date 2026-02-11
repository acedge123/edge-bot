/**
 * Request validation utilities
 * Uses lightweight manual validation (no external deps)
 */

import { ActionDef, ManageRequest } from './types';

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateRequest(req: any): req is ManageRequest {
  if (typeof req !== 'object' || req === null) {
    throw new ValidationError('Request must be an object');
  }

  if (typeof req.action !== 'string' || req.action.length === 0) {
    throw new ValidationError('action must be a non-empty string', 'action');
  }

  if (req.params !== undefined) {
    if (typeof req.params !== 'object' || req.params === null || Array.isArray(req.params)) {
      throw new ValidationError('params must be an object', 'params');
    }
  }

  if (req.dry_run !== undefined && typeof req.dry_run !== 'boolean') {
    throw new ValidationError('dry_run must be a boolean', 'dry_run');
  }

  if (req.idempotency_key !== undefined && typeof req.idempotency_key !== 'string') {
    throw new ValidationError('idempotency_key must be a string', 'idempotency_key');
  }

  return true;
}

export function validateParams(actionDef: ActionDef, params: Record<string, any>): void {
  const schema = actionDef.params_schema;
  const required = schema.required || [];

  // Check required fields
  for (const field of required) {
    if (!(field in params) || params[field] === undefined) {
      throw new ValidationError(`Missing required field: ${field}`, field);
    }
  }

  // Validate each property
  for (const [field, value] of Object.entries(params)) {
    const propSchema = schema.properties[field];
    if (!propSchema) {
      // Unknown field - could warn or ignore
      continue;
    }

    validateProperty(field, value, propSchema);
  }
}

function validateProperty(field: string, value: any, schema: any): void {
  if (value === null || value === undefined) {
    return; // Handled by required check
  }

  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') {
        throw new ValidationError(`${field} must be a string`, field);
      }
      if (schema.enum && !schema.enum.includes(value)) {
        throw new ValidationError(`${field} must be one of: ${schema.enum.join(', ')}`, field);
      }
      break;

    case 'number':
    case 'integer':
      if (typeof value !== 'number') {
        throw new ValidationError(`${field} must be a number`, field);
      }
      if (schema.minimum !== undefined && value < schema.minimum) {
        throw new ValidationError(`${field} must be >= ${schema.minimum}`, field);
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        throw new ValidationError(`${field} must be <= ${schema.maximum}`, field);
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new ValidationError(`${field} must be a boolean`, field);
      }
      break;

    case 'array':
      if (!Array.isArray(value)) {
        throw new ValidationError(`${field} must be an array`, field);
      }
      if (schema.items) {
        value.forEach((item, index) => {
          validateProperty(`${field}[${index}]`, item, schema.items);
        });
      }
      break;

    case 'object':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new ValidationError(`${field} must be an object`, field);
      }
      if (schema.properties) {
        for (const [prop, propSchema] of Object.entries(schema.properties)) {
          if (prop in value) {
            validateProperty(`${field}.${prop}`, value[prop], propSchema);
          }
        }
      }
      break;

    default:
      // Unknown type - skip validation
      break;
  }
}
