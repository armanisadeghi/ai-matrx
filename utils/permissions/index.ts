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

// Access gate. Pure types + helpers (AccessLevel, accessSatisfies, canEditAccess,
// canViewAccess, NO_ACCESS, resolveResourceAccess) from the isomorphic core; the
// client hook (useAccess) + browser convenience (getResourceAccess) from access.
// requireAccess is server-only — import from '@/utils/permissions/requireAccess'.
export * from './access-core';
export { useAccess, getResourceAccess } from './access';

