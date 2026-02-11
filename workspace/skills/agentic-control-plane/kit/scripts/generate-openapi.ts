/**
 * OpenAPI 3.0 Generator Script
 * Generates public/api/openapi.json from action registry
 */

import * as fs from 'fs';
import * as path from 'path';
import { generateOpenAPI } from '../kernel/src/openapi';
import { getMetaPack } from '../kernel/src/meta-pack';
import { iamPack } from '../packs/iam';
import { webhooksPack } from '../packs/webhooks';
import { settingsPack } from '../packs/settings';
import { mergePacks } from '../kernel/src/pack';

// Load bindings
const bindingsPath = path.join(__dirname, '../config/example.bindings.json');
const bindings = JSON.parse(fs.readFileSync(bindingsPath, 'utf-8'));

// Merge all packs
const metaPack = getMetaPack();
const allPacks = [metaPack, iamPack, webhooksPack, settingsPack];
const { actions } = mergePacks(allPacks);

// Generate OpenAPI spec
const baseUrl = process.env.API_BASE_URL || 'https://api.example.com';
const spec = generateOpenAPI(actions, baseUrl);

// Enhance spec with oneOf discriminated unions for params
// Best effort: create oneOf schemas for each action
const requestBodySchemas: any[] = actions.map(action => ({
  type: 'object',
  required: ['action', 'params'],
  properties: {
    action: {
      type: 'string',
      enum: [action.name],
      description: action.description
    },
    params: {
      ...action.params_schema,
      description: `Parameters for ${action.name}`
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
}));

// Update request body schema to use oneOf
if (spec.paths['/manage']?.post?.requestBody?.content?.['application/json']) {
  spec.paths['/manage'].post.requestBody.content['application/json'].schema = {
    oneOf: requestBodySchemas,
    discriminator: {
      propertyName: 'action',
      mapping: Object.fromEntries(
        actions.map(action => [action.name, `#/components/schemas/${action.name.replace(/\./g, '_')}Request`])
      )
    }
  };

  // Add individual action request schemas to components
  for (const action of actions) {
    const schemaName = action.name.replace(/\./g, '_');
    spec.components!.schemas![`${schemaName}Request`] = {
      type: 'object',
      required: ['action', 'params'],
      properties: {
        action: {
          type: 'string',
          enum: [action.name]
        },
        params: action.params_schema,
        idempotency_key: {
          type: 'string'
        },
        dry_run: {
          type: 'boolean',
          default: false
        }
      }
    };
  }
}

// Create output directory
const outputDir = path.join(__dirname, '../public/api');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Write spec to file
const outputPath = path.join(outputDir, 'openapi.json');
fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2), 'utf-8');

console.log(`✅ Generated OpenAPI spec: ${outputPath}`);
console.log(`   Actions: ${actions.length}`);
console.log(`   Base URL: ${baseUrl}`);
