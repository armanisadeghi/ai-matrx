/**
 * DM Messages API Routes
 *
 * GET /api/messages/[conversationId]/messages - List messages in conversation
 * POST /api/messages/[conversationId]/messages - Send a message
 *
 * Uses dm_ prefixed tables
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import type { Json } from "@/types/database.types";
import { z } from "zod";
import { getClaimsUser } from "@/utils/supabase/resolveUser";

// ============================================
// Validation Schemas
// ============================================

const sendMessageSchema = z.object({
  content: z
    .string()
    .min(1, "Message cannot be empty")
    .max(10000, "Message too long"),
  message_type: z
    .enum(["text", "image", "video", "audio", "file", "system"])
    .default("text"),
  media_url: z.string().url().optional(),
  media_thumbnail_url: z.string().url().optional(),
  media_metadata: z.record(z.string(), z.unknown()).optional(),
  reply_to_id: z.string().uuid().optional(),
  client_message_id: z.string().optional(),
});

// ============================================
// GET - List messages
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  try {
    const { conversationId } = await params;
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await getClaimsUser(supabase);
    if (authError || !user) {
      return NextResponse.json(
        { success: false, msg: "Not authenticated" },
        { status: 401 },
      );
    }

    const userId = user.id;

    // Check if user is participant
    const { data: participation, error: participationError } = await supabase
      .schema("communication").from("dm_conversation_participants")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .single();

    if (participationError || !participation) {
      return NextResponse.json(
        { success: false, msg: "Not a participant in this conversation" },
        { status: 403 },
      );
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const before = searchParams.get("before"); // ISO timestamp for pagination
    const after = searchParams.get("after"); // ISO timestamp for fetching new messages

    // Build query
    let query = supabase
      .schema("communication").from("dm_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null);

    // Apply pagination filters
    if (before) {
      query = query.lt("created_at", before);
    }
    if (after) {
      query = query.gt("created_at", after);
    }

    // Order and limit
    query = query
      .order("created_at", { ascending: !before }) // Descending when paginating back
      .limit(limit);

    const { data: messages, error: fetchError } = await query;

    if (fetchError) {
      console.error("[DM Messages API] Failed to fetch:", fetchError);
      return NextResponse.json(
        { success: false, msg: fetchError.message },
        { status: 500 },
      );
    }

    // Fetch sender info for each message
    const senderIds = [...new Set((messages || []).map((m) => m.sender_id))];
    const senderInfoMap = new Map();

    for (const senderId of senderIds) {
      const { data: userInfo } = await supabase.rpc("get_dm_user_info", {
        p_user_id: senderId,
      });
      if (userInfo && userInfo[0]) {
        senderInfoMap.set(senderId, userInfo[0]);
      }
    }

    // Attach sender info
    const messagesWithSender = (messages || []).map((m) => ({
      ...m,
      sender: senderInfoMap.get(m.sender_id) || null,
    }));

    // If we queried in descending order (for pagination), reverse to get chronological
    const sortedMessages = before
      ? messagesWithSender.reverse()
      : messagesWithSender;

    return NextResponse.json({
      success: true,
      data: sortedMessages,
      msg: "Messages fetched successfully",
    });
  } catch (error) {
    console.error("[DM Messages API] GET Error:", error);
    return NextResponse.json(
      { success: false, msg: "Internal server error" },
      { status: 500 },
    );
  }
}

// ============================================
// POST - Send message
// ============================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  try {
    const { conversationId } = await params;
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await getClaimsUser(supabase);
    if (authError || !user) {
      return NextResponse.json(
        { success: false, msg: "Not authenticated" },
        { status: 401 },
      );
    }

    const userId = user.id;

    // Check if user is participant
    const { data: participation, error: participationError } = await supabase
      .schema("communication").from("dm_conversation_participants")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .single();

    if (participationError || !participation) {
      return NextResponse.json(
        { success: false, msg: "Not a participant in this conversation" },
        { status: 403 },
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = sendMessageSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, msg: validation.error.issues[0].message },
        { status: 400 },
      );
    }

    const {
      content,
      message_type,
      media_url,
      media_thumbnail_url,
      media_metadata,
      reply_to_id,
      client_message_id,
    } = validation.data;

    // Check for duplicate message (idempotency)
    if (client_message_id) {
      const { data: existingMessage } = await supabase
        .schema("communication").from("dm_messages")
        .select("*")
        .eq("client_message_id", client_message_id)
        .single();

      if (existingMessage) {
        return NextResponse.json({
          success: true,
          data: existingMessage,
          duplicate: true,
          msg: "Message already exists",
        });
      }
    }

    // Verify reply_to message exists and is in this conversation
    if (reply_to_id) {
      const { data: replyToMessage } = await supabase
        .schema("communication").from("dm_messages")
        .select("id")
        .eq("id", reply_to_id)
        .eq("conversation_id", conversationId)
        .single();

      if (!replyToMessage) {
        return NextResponse.json(
          { success: false, msg: "Reply-to message not found" },
          { status: 400 },
        );
      }
    }

    // 🚨 THE MESSAGE TAKES ITS PARENT CONVERSATION'S ORGANIZATION, AND
    // REFUSES WHEN THE PARENT CANNOT BE READ. It used to fall through to
    // `ensureOrgIdServer`, so a conversation the caller could not read (RLS, a
    // deleted row, a bad id) filed the message in the SENDER'S PERSONAL
    // workspace — a message in a tenant the other participant is not even in,
    // silently. A child row never invents a tenant its parent already has.
    // common-docs/policies/context-is-carried-never-rebuilt.md rule 4.
    const { data: parentConversation } = await supabase
      .schema("communication").from("dm_conversations")
      .select("organization_id")
      .eq("id", conversationId)
      .single();
    const organizationId = parentConversation?.organization_id ?? "";
    if (organizationId.length === 0) {
      return NextResponse.json(
        {
          success: false,
          msg: "This conversation could not be read, so the message was not sent. Reopen it and try again.",
          code: "organization_context_required",
        },
        { status: 400 },
      );
    }

    // Insert message
    const { data: newMessage, error: insertError } = await supabase
      .schema("communication").from("dm_messages")
      .insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        sender_id: userId,
        content: content.trim(),
        message_type,
        media_url,
        media_thumbnail_url,
        media_metadata: (media_metadata ?? null) as Json | null,
        reply_to_id,
        client_message_id,
        status: "sent",
      })
      .select()
      .single();

    if (insertError) {
      console.error("[DM Messages API] Failed to send:", insertError);
      return NextResponse.json(
        { success: false, msg: insertError.message },
        { status: 500 },
      );
    }

    // Fetch sender info
    const { data: senderInfo } = await supabase.rpc("get_dm_user_info", {
      p_user_id: userId,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          ...newMessage,
          sender: senderInfo?.[0] || null,
        },
        msg: "Message sent successfully",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[DM Messages API] POST Error:", error);
    return NextResponse.json(
      { success: false, msg: "Internal server error" },
      { status: 500 },
    );
  }
}
