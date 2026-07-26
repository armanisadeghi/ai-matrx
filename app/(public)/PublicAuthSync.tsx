'use client';

import { usePublicAuthSync } from '@/hooks/usePublicAuthSync';

/**
 * Renders nothing. Runs the auth sync hook as a sibling rather
 * than wrapping children, so it adds zero nodes to the tree.
 */
export function PublicAuthSync() {
    usePublicAuthSync();
    return null;
}
