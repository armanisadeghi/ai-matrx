/**
 * Single DM Message API Routes
 * 
 * GET /api/messages/[conversationId]/messages/[id] - Get single message
 * PATCH /api/messages/[conversationId]/messages/[id] - Edit or delete message
 * DELETE /api/messages/[conversationId]/messages/[id] - Delete message
 * 
 * Uses dm_ prefixed tables
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { z } from 'zod';

// ============================================
// Validation Schemas
// ============================================

const updateMessageSchema = z.object({
  content: z.string().min(1).max(10000).optional(),
  deleted: z.boolean().optional(),
  deleted_for_everyone: z.boolean().optional(),
});

// ============================================
// GET - Get single message
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string; id: string }> }
) {
  try {
    const { conversationId, id: messageId } = await params;
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
    const { data: participation } = await supabase
      .schema('communication').from('dm_conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .single();

    if (!participation) {
      return NextResponse.json(
        { success: false, msg: 'Not a participant in this conversation' },
        { status: 403 }
      );
    }

    // Get message
    const { data: message, error: fetchError } = await supabase
      .schema('communication').from('dm_messages')
      .select('*')
      .eq('id', messageId)
      .eq('conversation_id', conversationId)
      .single();

    if (fetchError || !message) {
      return NextResponse.json(
        { success: false, msg: 'Message not found' },
        { status: 404 }
      );
    }

    // Check if message is deleted and user is not the sender
    if (message.deleted_at && message.sender_id !== userId) {
      return NextResponse.json(
        { success: false, msg: 'Message not found' },
        { status: 404 }
      );
    }

    // Fetch sender info
    const { data: senderInfo } = await supabase
      .rpc('get_dm_user_info', { p_user_id: message.sender_id });

    return NextResponse.json({
      success: true,
      data: {
        ...message,
        sender: senderInfo?.[0] || null,
      },
      msg: 'Message fetched successfully',
    });
  } catch (error) {
    console.error('[DM Message API] GET Error:', error);
    return NextResponse.json(
      { success: false, msg: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================
// PATCH - Edit or soft delete message
// ============================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string; id: string }> }
) {
  try {
    const { conversationId, id: messageId } = await params;
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
    const validation = updateMessageSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, msg: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    const { content, deleted, deleted_for_everyone } = validation.data;

    // Get message and verify ownership
    const { data: message, error: fetchError } = await supabase
      .schema('communication').from('dm_messages')
      .select('*')
      .eq('id', messageId)
      .eq('conversation_id', conversationId)
      .single();

    if (fetchError || !message) {
      return NextResponse.json(
        { success: false, msg: 'Message not found' },
        { status: 404 }
      );
    }

    // Only sender can edit/delete their messages
    if (message.sender_id !== userId) {
      return NextResponse.json(
        { success: false, msg: 'Not authorized to modify this message' },
        { status: 403 }
      );
    }

    // Build update object
    const updateData: Record<string, unknown> = {};

    if (content !== undefined) {
      updateData.content = content.trim();
      updateData.edited_at = new Date().toISOString();
    }

    if (deleted) {
      updateData.deleted_at = new Date().toISOString();
      if (deleted_for_everyone) {
        updateData.deleted_for_everyone = true;
        updateData.content = '[Message deleted]';
      }
    }

    // Update message
    const { data: updatedMessage, error: updateError } = await supabase
      .schema('communication').from('dm_messages')
      .update(updateData)
      .eq('id', messageId)
      .select()
      .single();

    if (updateError) {
      console.error('[DM Message API] Failed to update:', updateError);
      return NextResponse.json(
        { success: false, msg: updateError.message },
        { status: 500 }
      );
    }

    // Fetch sender info
    const { data: senderInfo } = await supabase
      .rpc('get_dm_user_info', { p_user_id: userId });

    return NextResponse.json({
      success: true,
      data: {
        ...updatedMessage,
        sender: senderInfo?.[0] || null,
      },
      msg: deleted ? 'Message deleted successfully' : 'Message updated successfully',
    });
  } catch (error) {
    console.error('[DM Message API] PATCH Error:', error);
    return NextResponse.json(
      { success: false, msg: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================
// DELETE - Permanently delete message (soft delete)
// ============================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string; id: string }> }
) {
  try {
    const { conversationId, id: messageId } = await params;
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

    // Get message and verify ownership
    const { data: message } = await supabase
      .schema('communication').from('dm_messages')
      .select('sender_id')
      .eq('id', messageId)
      .eq('conversation_id', conversationId)
      .single();

    if (!message) {
      return NextResponse.json(
        { success: false, msg: 'Message not found' },
        { status: 404 }
      );
    }

    // Only sender can delete their messages
    if (message.sender_id !== userId) {
      return NextResponse.json(
        { success: false, msg: 'Not authorized to delete this message' },
        { status: 403 }
      );
    }

    // Soft delete: set deleted_at and replace content
    const { error: deleteError } = await supabase
      .schema('communication').from('dm_messages')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_for_everyone: true,
        content: '[Message deleted]',
      })
      .eq('id', messageId);

    if (deleteError) {
      console.error('[DM Message API] Failed to delete:', deleteError);
      return NextResponse.json(
        { success: false, msg: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      msg: 'Message deleted successfully',
    });
  } catch (error) {
    console.error('[DM Message API] DELETE Error:', error);
    return NextResponse.json(
      { success: false, msg: 'Internal server error' },
      { status: 500 }
    );
  }
}
