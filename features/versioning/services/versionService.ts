/**
 * Versioning Service
 *
 * Thin wrappers around the Supabase RPCs for the snapshot versioning system.
 * All functions follow the existing pattern in features/text-diff/service/versionService.ts.
 */

import { supabase } from '@/utils/supabase/client';
import type {
    VersionEntityType,
    VersionHistoryItem,
    VersionSnapshot,
    VersionDiff,
    PromoteVersionResult,
    DriftItem,
    PinVersionResult,
} from '../types';

// ============================================================================
// Version History
// ============================================================================

/**
 * Fetch version history for any versioned entity.
 */
export async function getVersionHistory(
    entityType: VersionEntityType,
    entityId: string,
    limit: number = 50,
    offset: number = 0
): Promise<VersionHistoryItem[]> {
    const { data, error } = await supabase.rpc('get_version_history', {
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_limit: limit,
        p_offset: offset,
    });

    if (error) {
        console.error('Error fetching version history:', error);
        throw error;
    }

    return (data as unknown as VersionHistoryItem[]) || [];
}

// ============================================================================
// Version Snapshots
// ============================================================================

/**
 * Load the full snapshot for a specific version.
 */
export async function getVersionSnapshot(
    entityType: VersionEntityType,
    entityId: string,
    version: number
): Promise<VersionSnapshot> {
    const { data, error } = await supabase.rpc('get_version_snapshot', {
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_version: version,
    });

    if (error) {
        console.error('Error fetching version snapshot:', error);
        throw error;
    }

    return data as unknown as VersionSnapshot;
}

// ============================================================================
// Version Diffs
// ============================================================================

/**
 * Get a field-by-field diff of two versions.
 */
export async function getVersionDiff(
    entityType: VersionEntityType,
    entityId: string,
    versionA: number,
    versionB: number
): Promise<VersionDiff> {
    const { data, error } = await supabase.rpc('get_version_diff', {
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_version_a: versionA,
        p_version_b: versionB,
    });

    if (error) {
        console.error('Error fetching version diff:', error);
        throw error;
    }

    return data as unknown as VersionDiff;
}

// ============================================================================
// Promote / Restore
// ============================================================================

/**
 * Promote a historical version to become the current live state.
 * This snapshots the current state first, then overwrites with the selected version.
 */
export async function promoteVersion(
    entityType: VersionEntityType,
    entityId: string,
    version: number
): Promise<PromoteVersionResult> {
    const { data, error } = await supabase.rpc('promote_version', {
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_version: version,
    });

    if (error) {
        console.error('Error promoting version:', error);
        throw error;
    }

    return data as unknown as PromoteVersionResult;
}

/**
 * Restore a version (same as promote, returns just the new version number).
 */
export async function restoreVersion(
    entityType: VersionEntityType,
    entityId: string,
    version: number
): Promise<number> {
    const { data, error } = await supabase.rpc('restore_version', {
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_version: version,
    });

    if (error) {
        console.error('Error restoring version:', error);
        throw error;
    }

    return data as unknown as number;
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Purge old versions, keeping the N most recent + always v1.
 */
export async function purgeOldVersions(
    entityType: VersionEntityType,
    entityId: string,
    keepCount: number
): Promise<number> {
    const { data, error } = await supabase.rpc('purge_old_versions', {
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_keep_count: keepCount,
    });

    if (error) {
        console.error('Error purging old versions:', error);
        throw error;
    }

    return data as unknown as number;
}

// ============================================================================
// Prompt App Pinning
// ============================================================================

/**
 * Pin a prompt app to a specific prompt version.
 */
export async function pinPromptAppToVersion(
    appId: string,
    versionId: string
): Promise<PinVersionResult> {
    const { data, error } = await supabase.rpc('pin_prompt_app_to_version', {
        p_app_id: appId,
        p_version_id: versionId,
    });

    if (error) {
        console.error('Error pinning app to version:', error);
        throw error;
    }

    return data as unknown as PinVersionResult;
}

// ============================================================================
// Drift Detection
// ============================================================================

/**
 * Check which prompt apps are behind their prompt's current version.
 */
export async function checkPromptAppDrift(
    userId?: string
): Promise<DriftItem[]> {
    const { data, error } = await supabase.rpc('check_prompt_app_drift', {
        p_user_id: userId,
    });

    if (error) {
        console.error('Error checking prompt app drift:', error);
        throw error;
    }

    return (data as unknown as DriftItem[]) || [];
}
