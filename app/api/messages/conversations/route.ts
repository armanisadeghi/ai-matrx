/**
 * DM Conversations API Routes
 *
 * GET /api/messages/conversations - List a page of conversations for the
 *   current user (`limit`, default 20 / max 50; keyset pagination via
 *   `before_sort_at` + `before_conversation_id`, echoed back as `nextCursor`)
 * POST /api/messages/conversations - Create new conversation or return existing
 *
 * Uses dm_ prefixed tables
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { parseConversationParticipants } from "@/features/messaging/data/conversation-list";
import { z } from "zod";

// ============================================
// Validation Schemas
// ============================================

const createConversationSchema = z.object({
  type: z.enum(["direct", "group"]).default("direct"),
  participant_ids: z
    .array(z.string().uuid())
    .min(1, "At least one participant required"),
  group_name: z.string().optional(),
});

// ============================================
// GET - List conversations
// ============================================

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, msg: "Not authenticated" },
        { status: 401 },
      );
    }

    const userId = user.id;

    // Parse query params. D247: pagination is keyset on last-message time
    // (the RPC's own sort key), not limit/offset — `before_sort_at` +
    // `before_conversation_id` continue from the previous page's last row
    // (both echoed back as `nextCursor` below).
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const beforeSortAt = searchParams.get("before_sort_at");
    const beforeConversationId = searchParams.get("before_conversation_id");

    // Get conversations using the helper function — paginated at the RPC
    // level so the 500+-row unbounded read (D247) is never issued here.
    const { data: conversations, error: fetchError } = await supabase.rpc(
      "get_dm_conversations_with_details",
      {
        p_user_id: userId,
        p_limit: limit,
        p_before_sort_at: beforeSortAt ?? undefined,
        p_before_conversation_id: beforeConversationId ?? undefined,
      },
    );

    if (fetchError) {
      console.error("[DM Conversations API] Failed to fetch:", fetchError);
      return NextResponse.json(
        { success: false, msg: fetchError.message },
        { status: 500 },
      );
    }

    const pageConversations = conversations ?? [];
    const hasMore = pageConversations.length === limit;
    const lastRow = pageConversations[pageConversations.length - 1];
    const nextCursor = hasMore && lastRow
      ? {
          before_sort_at: lastRow.last_message_at ?? lastRow.conversation_updated_at,
          before_conversation_id: lastRow.conversation_id,
        }
      : null;

    const conversationsWithParticipants = pageConversations.map((conv) => {
      const participantsWithUser = parseConversationParticipants(
        conv.participants,
      );

      // For direct chats, compute display name/image from the other participant
      const otherParticipant = participantsWithUser.find(
        (p) => p.user_id !== userId,
      );

      return {
        ConversationID: conv.conversation_id,
        Type: conv.conversation_type,
        GroupName: conv.group_name,
        GroupImage: conv.group_image_url,
        CreatedAt: conv.conversation_created_at,
        UpdatedAt: conv.conversation_updated_at,
        DisplayName:
          conv.conversation_type === "direct" && otherParticipant
            ? otherParticipant.user?.display_name ||
              otherParticipant.user?.email ||
              "Unknown"
            : conv.group_name || "Group Chat",
        DisplayImage:
          conv.conversation_type === "direct" && otherParticipant
            ? otherParticipant.user?.avatar_url
            : conv.group_image_url,
        IsMuted:
          participantsWithUser.find((p) => p.user_id === userId)?.is_muted ||
          false,
        LastReadAt: participantsWithUser.find((p) => p.user_id === userId)
          ?.last_read_at,
        Participants: participantsWithUser.map((p) => ({
          UserID: p.user_id,
          DisplayName: p.user?.display_name,
          Email: p.user?.email,
          AvatarUrl: p.user?.avatar_url,
          Role: p.role,
        })),
        LastMessage: conv.last_message_content
          ? {
              Content: conv.last_message_content,
              SenderID: conv.last_message_sender_id,
              CreatedAt: conv.last_message_at,
            }
          : null,
        UnreadCount: conv.unread_count,
      };
    });

    return NextResponse.json({
      success: true,
      data: conversationsWithParticipants,
      total: pageConversations.length,
      hasMore,
      nextCursor,
      msg: "Conversations fetched successfully",
    });
  } catch (error) {
    console.error("[DM Conversations API] Error:", error);
    return NextResponse.json(
      { success: false, msg: "Internal server error" },
      { status: 500 },
    );
  }
}

// ============================================
// POST - Create conversation
// ============================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, msg: "Not authenticated" },
        { status: 401 },
      );
    }

    const userId = user.id;

    // Parse and validate request body
    const body = await request.json();
    const validation = createConversationSchema.safeParse(body);

    if (!validation.success) {
      const firstErrorMessage =
        validation.error.issues.length > 0
          ? validation.error.issues[0].message
          : "Invalid request body";

      return NextResponse.json(
        { success: false, msg: firstErrorMessage },
        { status: 400 },
      );
    }

    const { type, participant_ids, group_name } = validation.data;

    // For direct chats, resolve atomically via the ONE canonical get-or-create
    // RPC (advisory-locked — no duplicate conversation under concurrency). The
    // cheap find pre-check only sets the `existing` flag / status for the
    // response; it is now race-harmless because the RPC create is atomic.
    if (type === "direct" && participant_ids.length === 1) {
      const otherUserId = participant_ids[0];

      const { data: preExistingId } = await supabase.rpc(
        "find_dm_direct_conversation",
        { p_user1_id: userId, p_user2_id: otherUserId },
      );

      // `p_organization_id` is omitted — the RPC's SQL DEFAULT (NULL) applies;
      // the generated arg type is `p_organization_id?: string` (optional, not
      // nullable), so passing an explicit `null` is a type error.
      const { data: convId, error: convError } = await supabase.rpc(
        "dm_get_or_create_direct_conversation",
        {
          p_user1_id: userId,
          p_user2_id: otherUserId,
        },
      );
      if (convError || !convId) {
        console.error(
          "[DM Conversations API] get-or-create failed:",
          convError,
        );
        return NextResponse.json(
          { success: false, msg: convError?.message ?? "Could not resolve conversation" },
          { status: 500 },
        );
      }

      // `existing` iff the pre-check found the SAME live conversation the RPC
      // returned. find_dm has no deleted_at filter but the RPC skips soft-deleted
      // and creates fresh — so comparing ids (not just Boolean(preExistingId))
      // avoids falsely reporting a freshly-created conversation as "existing".
      const existed = Boolean(preExistingId) && preExistingId === convId;

      return NextResponse.json(
        {
          success: true,
          data: { ConversationID: convId },
          existing: existed,
          msg: existed
            ? "Existing conversation found"
            : "Conversation created successfully",
        },
        { status: existed ? 200 : 201 },
      );
    }

    // Verify all participants exist in auth.users
    // We can use lookup_user_by_email or just try to create - RLS will handle invalid users

    // Resolve the creator's personal org (org-scoped write; never-null fallback).
    const { data: organizationId, error: orgError } = await supabase.rpc(
      "current_personal_org_id",
    );
    if (orgError || !organizationId) {
      console.error("[DM Conversations API] Failed to resolve org:", orgError);
      return NextResponse.json(
        { success: false, msg: "Could not resolve organization" },
        { status: 500 },
      );
    }

    // Create conversation
    const { data: newConversation, error: createError } = await supabase
      .schema("communication").from("dm_conversations")
      .insert({
        type,
        group_name: type === "group" ? group_name : null,
        created_by: userId,
        organization_id: organizationId,
      })
      .select()
      .single();

    if (createError) {
      console.error("[DM Conversations API] Failed to create:", createError);
      return NextResponse.json(
        { success: false, msg: createError.message },
        { status: 500 },
      );
    }

    // Add all participants (including creator)
    const allParticipants = [
      userId,
      ...participant_ids.filter((id) => id !== userId),
    ];
    const participantRecords = allParticipants.map((participantId, index) => ({
      conversation_id: newConversation.id,
      user_id: participantId,
      role: index === 0 ? "owner" : "member", // Creator is owner
      organization_id: organizationId,
    }));

    const { error: participantsError } = await supabase
      .schema("communication").from("dm_conversation_participants")
      .insert(participantRecords);

    if (participantsError) {
      // Rollback: delete the conversation
      await supabase
        .schema("communication").from("dm_conversations")
        .delete()
        .eq("id", newConversation.id);
      console.error(
        "[DM Conversations API] Failed to add participants:",
        participantsError,
      );
      return NextResponse.json(
        { success: false, msg: participantsError.message },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: { ConversationID: newConversation.id },
        existing: false,
        msg: "Conversation created successfully",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[DM Conversations API] Error:", error);
    return NextResponse.json(
      { success: false, msg: "Internal server error" },
      { status: 500 },
    );
  }
}
