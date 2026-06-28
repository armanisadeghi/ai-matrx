'use client';

/**
 * usePublicChatProps — Derives UnifiedChatWrapper props for public routes.
 *
 * Bridges URL-driven agent/conversation selection (from public chat layouts)
 * into the props shape that UnifiedChatWrapper expects.
 *
 * Usage:
 * ```tsx
 * function PublicChatView({ agentId, conversationId }: { agentId: string; conversationId?: string }) {
 *     const chatProps = usePublicChatProps({ agentId, conversationId });
 *     return <UnifiedChatWrapper {...chatProps} />;
 * }
 * ```
 */

import { useCallback, useMemo } from 'react';
import type { UnifiedChatWrapperProps } from '@/features/cx-conversation/UnifiedChatWrapper';
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";

export interface PublicChatPropsConfig {
    /** Agent/prompt ID (from URL or context) */
    agentId: string;
    /** Existing conversation ID to continue (from URL) */
    conversationId?: string;
    /** Agent display name (shown as title) */
    agentName?: string;
    /** Variable definitions from the agent config */
    variableDefaults?: VariableDefinition[];
    /** Pre-filled variable values (e.g. from URL params) */
    variables?: Record<string, string>;
    /** Whether the agent requires variable replacement */
    requiresVariableReplacement?: boolean;
    /** Callback when conversation ID changes (for URL sync) */
    onConversationIdChange?: (conversationId: string) => void;
    /** Layout mode override */
    layout?: 'full' | 'embedded' | 'compact';
    /** Custom sidebar slot */
    sidebarSlot?: React.ReactNode;
    /** Custom header slot */
    headerSlot?: React.ReactNode;
}

export function usePublicChatProps(config: PublicChatPropsConfig): UnifiedChatWrapperProps {
    const {
        agentId,
        conversationId,
        agentName,
        variableDefaults,
        variables,
        requiresVariableReplacement,
        onConversationIdChange,
        layout = 'full',
        sidebarSlot,
        headerSlot,
    } = config;

    const apiMode = conversationId ? 'conversation' as const : 'agent' as const;

    const handleConversationIdChange = useCallback((id: string) => {
        onConversationIdChange?.(id);
    }, [onConversationIdChange]);

    return useMemo((): UnifiedChatWrapperProps => ({
        agentId,
        apiMode,
        conversationId,
        loadHistory: !!conversationId,
        authenticated: false,
        layout,
        title: agentName,

        // Public routes: disable auth-gated features
        showVoice: false,
        showResourcePicker: false,
        showModelPicker: false,

        // Variable support
        variableDefaults,
        variables,
        requiresVariableReplacement,
        showVariables: !!variableDefaults?.length,

        // Slots
        sidebarSlot,
        headerSlot,

        // Callbacks
        onConversationIdChange: handleConversationIdChange,
    }), [agentId, apiMode, conversationId, agentName, layout,
         variableDefaults, variables, requiresVariableReplacement,
         sidebarSlot, headerSlot, handleConversationIdChange]);
}
