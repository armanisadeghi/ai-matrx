/**
 * Permission System - Main Exports
 * 
 * Central export point for all permission-related utilities, types, and hooks.
 * Import from here to access any permission functionality.
 */

// Types
export * from './types';

// Service functions
export * from './service';

// React hooks
export * from './hooks';

// Access gate (useAccess / getResourceAccess). requireAccess is server-only —
// import it from '@/utils/permissions/requireAccess' directly, not via this barrel.
export * from './access';

