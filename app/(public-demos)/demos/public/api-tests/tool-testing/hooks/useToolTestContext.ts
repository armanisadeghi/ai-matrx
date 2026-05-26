'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAppSelector } from '@/lib/redux/hooks';
import { selectUserId } from '@/lib/redux/selectors/userSelectors';
import { supabase } from '@/utils/supabase/client';
import type { TestContext } from '@/features/tool-call-visualization/testing/types';

const CONVERSATION_COOKIE_KEY = 'tool_test_conversation_id';

function readConversationCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CONVERSATION_COOKIE_KEY}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeConversationCookie(id: string | null): void {
  if (typeof document === 'undefined') return;
  if (id) {
    document.cookie = `${CONVERSATION_COOKIE_KEY}=${encodeURIComponent(id)};path=/;max-age=${60 * 60 * 24 * 30};SameSite=Lax`;
  } else {
    document.cookie = `${CONVERSATION_COOKIE_KEY}=;path=/;max-age=0`;
  }
}

export interface UseToolTestContextReturn {
  /** Authenticated user's real ID from Redux (Supabase auth) */
  userId: string | null;
  /**
   * Real Supabase JWT for the active session.
   * This is what the Python backend must receive — never a static/admin token.
   */
  authToken: string | null;
  /** Whether the session token has been loaded */
  tokenReady: boolean;
  /** Real conversation ID — persisted to cookie across page loads */
  conversationId: string | null;
  /** Whether a conversation is ready for execution */
  conversationReady: boolean;
  /** Optional scope context (org/project/task) */
  scopeOverride: {
    organization_id?: string;
    project_id?: string;
    task_id?: string;
  };
  /** Set conversation ID directly (user-provided existing ID) — persisted to cookie */
  setConversationId: (id: string | null) => void;
  /** Create a new placeholder conversation via API route */
  createConversation: () => Promise<void>;
  /** Whether conversation creation is in progress */
  isCreatingConversation: boolean;
  /** Set the scope override (org/project/task) */
  setScopeOverride: (scope: { organization_id?: string; project_id?: string; task_id?: string }) => void;
  /** Build the full TestContext for executeToolTest */
  buildTestContext: () => TestContext | undefined;
}

export function useToolTestContext(): UseToolTestContextReturn {
  const userId = useAppSelector(selectUserId);

  // ── Real JWT from active Supabase session ──────────────────────────────────
  // This is the only correct token for tool testing. Never use a static/admin token.
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadToken = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!cancelled) {
        setAuthToken(session?.access_token ?? null);
        setTokenReady(true);
      }
    };

    loadToken();

    // Keep token fresh — Supabase auto-refreshes sessions; listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) {
        setAuthToken(session?.access_token ?? null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // ── Conversation state — persisted to cookie ───────────────────────────────
  const [conversationId, setConversationIdState] = useState<string | null>(() => readConversationCookie());
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);

  const setConversationId = useCallback((id: string | null) => {
    setConversationIdState(id);
    writeConversationCookie(id);
  }, []);

  // ── Scope state ────────────────────────────────────────────────────────────
  const [scopeOverride, setScopeOverride] = useState<{
    organization_id?: string;
    project_id?: string;
    task_id?: string;
  }>({});

  const createConversation = useCallback(async () => {
    setIsCreatingConversation(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch('/api/tool-testing/conversation', { method: 'POST', headers });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      const { conversation_id } = await res.json() as { conversation_id: string };
      setConversationId(conversation_id);
    } finally {
      setIsCreatingConversation(false);
    }
  }, [setConversationId, authToken]);

  const buildTestContext = useCallback((): TestContext | undefined => {
    if (!conversationId) return undefined;
    return {
      conversation_id: conversationId,
      ...scopeOverride,
    };
  }, [conversationId, scopeOverride]);

  return {
    userId,
    authToken,
    tokenReady,
    conversationId,
    conversationReady: !!conversationId,
    scopeOverride,
    setConversationId,
    createConversation,
    isCreatingConversation,
    setScopeOverride,
    buildTestContext,
  };
}
