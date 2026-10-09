// POST /api/admin/agent-review/feedback — the admin seat's write into a review
// discussion thread it is not a member of.
//
// `communication.dm_conversations` is a private class: row security admits only
// members (measured 2026-10-08: admin@admin.com with the lane open is refused
// an INSERT into dm_messages on a conversation it is not in). The review item
// page lives in /administration and promises the admin can answer the thread,
// so the write goes through here — lane + admin identity re-checked, scoped to
// conversations that belong to an agent.review_queue row, never any thread.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { hasAdminPower } from "@/utils/auth/adminLaneServer";

interface FeedbackBody {
  reviewId: string;
  content: string;
  status: string;
  actorLabel: string;
  clientMessageId: string;
}

function parse(body: unknown): FeedbackBody | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  for (const key of ["reviewId", "content", "status", "actorLabel", "clientMessageId"]) {
    if (typeof b[key] !== "string" || (b[key] as string).trim().length === 0) return null;
  }
  return b as unknown as FeedbackBody;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data, error } = await getClaimsUser(supabase);
  if (error || !data.user) {
    return NextResponse.json({ error: "User not authenticated" }, { status: 401 });
  }
  const userId = data.user.id;
  if (!(await hasAdminPower(supabase, userId))) {
    return NextResponse.json(
      { error: "Forbidden: this is an admin action, and admin actions only work inside the admin section." },
      { status: 403 },
    );
  }
  const body = parse(await request.json().catch(() => null));
  if (!body) {
    return NextResponse.json({ error: "reviewId, content, status, actorLabel and clientMessageId are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: review, error: reviewError } = await admin
    .schema("agent")
    .from("review_queue")
    .select("id, conversation_id")
    .eq("id", body.reviewId)
    .maybeSingle();
  if (reviewError || !review?.conversation_id) {
    return NextResponse.json({ error: "Review item or its discussion thread was not found" }, { status: 404 });
  }
  const { data: conversation, error: conversationError } = await admin
    .schema("communication")
    .from("dm_conversations")
    .select("organization_id")
    .eq("id", review.conversation_id)
    .single();
  if (conversationError || !conversation) {
    return NextResponse.json({ error: "Discussion thread was not found" }, { status: 404 });
  }
  const { error: insertError } = await admin
    .schema("communication")
    .from("dm_messages")
    .insert({
      conversation_id: review.conversation_id,
      sender_id: userId,
      content: body.content,
      message_type: "text",
      status: "sent",
      client_message_id: body.clientMessageId,
      organization_id: conversation.organization_id,
      created_by: userId,
      metadata: {
        actor_kind: "human",
        actor_label: body.actorLabel,
        review_event: body.status,
        review_queue_id: review.id,
      },
    });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
