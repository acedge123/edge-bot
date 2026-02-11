/**
 * Kernel entry point
 * Exports everything needed to embed the kernel in a host app
 */

export * from './src/types';
export * from './src/auth';
export * from './src/audit';
export * from './src/idempotency';
export * from './src/rate_limit';
export * from './src/ceilings';
export * from './src/validate';
export * from './src/openapi';
export * from './src/router';
export * from './src/pack';
export * from './src/meta-pack';

// Re-export main router creator
export { createManageRouter } from './src/router';
export type { ManageRouter, RequestMeta } from './src/router';
