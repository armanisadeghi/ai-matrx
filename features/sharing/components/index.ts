/**
 * Sharing Components - Main Exports
 * 
 * Generic, reusable sharing components that work with ANY resource type.
 * Just pass resourceType, resourceId, and resourceName as props.
 */

export { ShareButton } from './ShareButton';
export { ShareModal } from './ShareModal';
export { AccessSummaryPanel } from './AccessSummaryPanel';
/** The `share` port binding @ai-matrx/records-ui asks its host for. */
export { recordStoreShare } from './RecordStoreShareSurface';
export { PermissionsList } from './PermissionsList';
export { PermissionBadge, PublicBadge, PermissionLevelDescription } from './PermissionBadge';

// Tab components (internal use, but exported for flexibility)
export { ShareWithUserTab } from './tabs/ShareWithUserTab';
export { ShareWithOrgTab } from './tabs/ShareWithOrgTab';
export { PublicAccessTab } from './tabs/PublicAccessTab';

