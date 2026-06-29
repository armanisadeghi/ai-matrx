/**
 * Single DM Conversation API Routes
 * 
 * GET /api/messages/conversations/[id] - Get conversation details
 * PUT /api/messages/conversations/[id] - Update conversation settings
 * DELETE /api/messages/conversations/[id] - Leave or delete conversation
 * 
 * Uses dm_ prefixed tables
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { z } from 'zod';
import type { TablesUpdate } from '@/types/database.types';
import { isDurableMediaUrl } from '@/lib/media/durability';

// ============================================
// Validation Schemas
// ============================================

const updateConversationSchema = z.object({
  is_muted: z.boolean().optional(),
  is_archived: z.boolean().optional(),
  group_name: z.string().optional(),
  // A group image is rendered for every OTHER member — a signed, expiring S3
  // link would break for them days later. Reject it at the edge; callers must
  // pass a durable CDN/public URL (or upload via the file handler first).
  group_image_url: z
    .string()
    .url()
    .refine(isDurableMediaUrl, {
      message:
        'group_image_url must be a durable public/CDN URL, not an expiring signed S3 link.',
    })
    .optional(),
});

// ============================================
// GET - Get conversation details
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, msg: 'Not authenticated' },
        { status: 401 }
      );
    }

    const userId = user.id;

    // Check if user is participant
    const { data: participation, error: participationError } = await supabase
      .schema('communication').from('dm_conversation_participants')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .single();

    if (participationError || !participation) {
      return NextResponse.json(
        { success: false, msg: 'Not a participant in this conversation' },
        { status: 403 }
      );
    }

    // Get conversation
    const { data: conversation, error: convError } = await supabase
      .schema('communication').from('dm_conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      return NextResponse.json(
        { success: false, msg: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Get all participants with user info
    const { data: participants } = await supabase
      .schema('communication').from('dm_conversation_participants')
      .select('*')
      .eq('conversation_id', conversationId);

    const participantsWithUser = await Promise.all(
      (participants || []).map(async (p) => {
        const { data: userInfo } = await supabase
          .rpc('get_dm_user_info', { p_user_id: p.user_id });
        return {
          ...p,
          user: userInfo?.[0] || null,
        };
      })
    );

    // Update last_read_at for current user
    await supabase
      .schema('communication').from('dm_conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);

    return NextResponse.json({
      success: true,
      data: {
        ConversationID: conversation.id,
        Type: conversation.type,
        GroupName: conversation.group_name,
        GroupImage: conversation.group_image_url,
        CreatedBy: conversation.created_by,
        CreatedAt: conversation.created_at,
        UpdatedAt: conversation.updated_at,
        Participants: participantsWithUser.map((p) => ({
          UserID: p.user_id,
          DisplayName: p.user?.display_name,
          Email: p.user?.email,
          AvatarUrl: p.user?.avatar_url,
          Role: p.role,
          LastReadAt: p.last_read_at,
          IsMuted: p.is_muted,
        })),
      },
      msg: 'Conversation fetched successfully',
    });
  } catch (error) {
    console.error('[DM Conversation API] GET Error:', error);
    return NextResponse.json(
      { success: false, msg: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================
// PUT - Update conversation settings
// ============================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, msg: 'Not authenticated' },
        { status: 401 }
      );
    }

    const userId = user.id;

    // Parse and validate request body
    const body = await request.json();
    const validation = updateConversationSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, msg: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    const { is_muted, is_archived, group_name, group_image_url } = validation.data;

    // Check if user is participant
    const { data: participation, error: participationError } = await supabase
      .schema('communication').from('dm_conversation_participants')
      .select('role')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .single();

    if (participationError || !participation) {
      return NextResponse.json(
        { success: false, msg: 'Not a participant in this conversation' },
        { status: 403 }
      );
    }

    // Update participant settings (mute, archive)
    if (is_muted !== undefined || is_archived !== undefined) {
      const participantUpdate: TablesUpdate<{ schema: 'communication' }, 'dm_conversation_participants'> = {};
      if (is_muted !== undefined) participantUpdate.is_muted = is_muted;
      if (is_archived !== undefined) participantUpdate.is_archived = is_archived;

      await supabase
        .schema('communication').from('dm_conversation_participants')
        .update(participantUpdate)
        .eq('conversation_id', conversationId)
        .eq('user_id', userId);
    }

    // Update group settings (only owner/admin can do this)
    if (group_name !== undefined || group_image_url !== undefined) {
      // Check if conversation is a group
      const { data: conversation } = await supabase
        .schema('communication').from('dm_conversations')
        .select('type, created_by')
        .eq('id', conversationId)
        .single();

      if (conversation?.type !== 'group') {
        return NextResponse.json(
          { success: false, msg: 'Cannot update group settings on a direct conversation' },
          { status: 400 }
        );
      }

      // Check if user is owner or admin
      if (conversation.created_by !== userId && participation.role !== 'admin') {
        return NextResponse.json(
          { success: false, msg: 'Not authorized to update group settings' },
          { status: 403 }
        );
      }

      const convUpdate: TablesUpdate<{ schema: 'communication' }, 'dm_conversations'> = {};
      if (group_name !== undefined) convUpdate.group_name = group_name;
      if (group_image_url !== undefined) convUpdate.group_image_url = group_image_url;

      await supabase
        .schema('communication').from('dm_conversations')
        .update(convUpdate)
        .eq('id', conversationId);
    }

    return NextResponse.json({
      success: true,
      data: { ConversationID: conversationId },
      msg: 'Conversation updated successfully',
    });
  } catch (error) {
    console.error('[DM Conversation API] PUT Error:', error);
    return NextResponse.json(
      { success: false, msg: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================
// DELETE - Leave or delete conversation
// ============================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, msg: 'Not authenticated' },
        { status: 401 }
      );
    }

    const userId = user.id;

    // Get conversation and participation info
    const { data: conversation } = await supabase
      .schema('communication').from('dm_conversations')
      .select('type, created_by')
      .eq('id', conversationId)
      .single();

    if (!conversation) {
      return NextResponse.json(
        { success: false, msg: 'Conversation not found' },
        { status: 404 }
      );
    }

    // For group chats where user is owner, delete the entire conversation
    if (conversation.type === 'group' && conversation.created_by === userId) {
      await supabase.schema('communication').from('dm_conversations').delete().eq('id', conversationId);
      return NextResponse.json({
        success: true,
        msg: 'Conversation deleted successfully',
      });
    }

    // Otherwise, just leave the conversation (archive it)
    await supabase
      .schema('communication').from('dm_conversation_participants')
      .update({ is_archived: true })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);

    return NextResponse.json({
      success: true,
      msg: 'Left conversation successfully',
    });
  } catch (error) {
    console.error('[DM Conversation API] DELETE Error:', error);
    return NextResponse.json(
      { success: false, msg: 'Internal server error' },
      { status: 500 }
    );
  }
}
