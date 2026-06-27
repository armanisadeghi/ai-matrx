// POST /api/extension/append-message
//
// Append a message to an existing cx_conversation as if it came from the
// authenticated user / agent. Used by the matrx-extend Chrome extension's
// `conversation.appendMessage` FRONTEND_RPC action.
//
// Auth — two methods, in priority order (cookie wins):
//   1. Supabase session cookie (when called from a tab in this app, or
//      when the extension SW forwards cookies for an authenticated
//      origin).
//   2. Bearer token: Authorization: Bearer <AGENT_API_KEY>. Used when
//      the extension SW calls headlessly with no cookie.
//
// Behavior — thin wrapper over `createCxMessage` from
// `features/public-chat/services/cx-chat.ts`. Computes the next
// `position` from the existing rows (max + 1) before inserting. Does NOT
// open new RLS policies; the existing cx_message policies gate the
// insert when called via the cookie path.
//
// Wire format documented in docs/MATRX_EXTEND_CONNECTION.md.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createCxMessage,
  getCxConversation,
} from "@/features/public-chat/services/cx-chat";
import type { CxMessageInsert } from "@/features/public-chat/types/cx-tables";
import { createClient } from "@/utils/supabase/server";
import { validateAgentApiKey } from "@/lib/services/agent-auth";
import {
  AppendMessageRequestSchema,
  type AppendMessageRequest,
} from "@/lib/types/bridge-envelope";

// Request validation lives in `@/lib/types/bridge-envelope` so the
// extension SW, the demo page, and this route all share one shape.
type AppendMessageInput = AppendMessageRequest;

// ---------------------------------------------------------------------------
// Auth resolution — cookie first, Bearer fallback
// ---------------------------------------------------------------------------

interface AuthResult {
  ok: boolean;
  /** Supabase auth.users.id when authenticated via cookie; null on Bearer. */
  userId: string | null;
  error?: string;
}

async function resolveAuth(request: NextRequest): Promise<AuthResult> {
  // Try cookie session first.
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user?.id) {
      return { ok: true, userId: data.user.id };
    }
  } catch (err) {
    // Cookie path threw (rare — unreachable Supabase). Fall through to
    // Bearer; let that decide.
    console.error("[extension/append-message] cookie auth threw:", err);
  }

  // Bearer fallback.
  const bearer = validateAgentApiKey(request);
  if (bearer.valid) {
    return { ok: true, userId: null };
  }

  return {
    ok: false,
    userId: null,
    error: "unauthorized",
  };
}

// ---------------------------------------------------------------------------
// Position resolution — next-monotonic per conversation
// ---------------------------------------------------------------------------

async function nextPosition(conversationId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("chat").from("message")
    .select("position")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("position", { ascending: false })
    .limit(1);

  if (error) {
    console.error(
      "[extension/append-message] position lookup failed:",
      error,
    );
    throw new Error(error.message);
  }

  if (!data || data.length === 0) return 0;
  const last = data[0]?.position;
  return typeof last === "number" ? last + 1 : 0;
}

// ---------------------------------------------------------------------------
// Content normalization
// ---------------------------------------------------------------------------

function normalizeContent(input: AppendMessageInput["content"]): unknown[] {
  if (typeof input === "string") {
    return [{ type: "text", text: input }];
  }
  if (Array.isArray(input)) return input;
  return [input];
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // 1. Auth gate.
  const auth = await resolveAuth(request);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error ?? "unauthorized" },
      { status: 401 },
    );
  }

  // 2. Parse + validate body.
  let parsed: AppendMessageInput;
  try {
    const raw = await request.json();
    parsed = AppendMessageRequestSchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_request",
          issues: err.issues,
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "invalid_json_body" },
      { status: 400 },
    );
  }

  // 3. Verify conversation exists. Returns 404 instead of letting the
  //    insert fail with a foreign-key error — the extension SW gets a
  //    crisp signal it can branch on.
  const conversation = await getCxConversation(parsed.conversationId);
  if (!conversation) {
    return NextResponse.json(
      { ok: false, error: "conversation_not_found" },
      { status: 404 },
    );
  }

  // 4. Compute next position (monotonic per conversation).
  let position: number;
  try {
    position = await nextPosition(parsed.conversationId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "position_lookup_failed";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }

  // 5. Insert.
  const insert: CxMessageInsert = {
    conversation_id: parsed.conversationId,
    role: parsed.role,
    position,
    content: normalizeContent(parsed.content) as CxMessageInsert["content"],
    metadata: (parsed.metadata ?? {}) as CxMessageInsert["metadata"],
    source: parsed.source ?? "extension",
    agent_id: parsed.agentId ?? null,
  };

  const created = await createCxMessage(insert);
  if (!created) {
    return NextResponse.json(
      { ok: false, error: "insert_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      message: {
        id: created.id,
        conversationId: created.conversation_id,
        role: created.role,
        content: created.content,
        metadata: created.metadata,
        position: created.position,
        source: created.source,
        agentId: created.agent_id,
        createdAt: created.created_at,
      },
    },
    { status: 200 },
  );
}
