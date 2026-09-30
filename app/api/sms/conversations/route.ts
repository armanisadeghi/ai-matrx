/**
 * GET /api/sms/conversations
 * POST /api/sms/conversations
 *
 * List and manage SMS conversations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/adminClient';
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { tryWriteOne, writeFailureStatus, type WriteOneAction } from "@/utils/supabase/writeOne";
import type { TablesUpdate } from '@/types/database.types';

/**
 * GET /api/sms/conversations
 * List conversations for the authenticated user.
 * Admin users can see all conversations with ?admin=true.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await getClaimsUser(supabase);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, msg: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const status = searchParams.get('status') || 'active';

    // Use admin client so we can fetch regardless of RLS
    // (RLS policies check user_id, but admin routes need broader access)
    const adminSupabase = createAdminClient();

    let query = adminSupabase
      .schema('communication').from('sms_conversations')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, count, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, msg: 'Failed to fetch conversations', error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      msg: 'Conversations fetched',
      data: {
        conversations: data || [],
        total: count || 0,
      },
    });
  } catch (err) {
    console.error('Error in conversations GET:', err);
    return NextResponse.json(
      { success: false, msg: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sms/conversations
 * Update a conversation (close, block, mark read).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await getClaimsUser(supabase);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, msg: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action, conversationId } = body;

    if (!action || !conversationId) {
      return NextResponse.json(
        { success: false, msg: 'Missing required fields: action, conversationId' },
        { status: 400 }
      );
    }

    const adminSupabase = createAdminClient();

    // Verify ownership
    const { data: conv } = await adminSupabase
      .schema('communication').from('sms_conversations')
      .select('user_id')
      .eq('id', conversationId)
      .single();

    if (!conv || conv.user_id !== user.id) {
      return NextResponse.json(
        { success: false, msg: 'Conversation not found' },
        { status: 404 }
      );
    }

    const ACTION_PATCH: Record<string, { patch: TablesUpdate<{ schema: 'communication' }, 'sms_conversations'>; verb: WriteOneAction }> = {
      close: { patch: { status: 'closed' }, verb: 'change' },
      block: { patch: { status: 'blocked' }, verb: 'change' },
      reopen: { patch: { status: 'active' }, verb: 'change' },
      mark_read: { patch: { unread_count: 0 }, verb: 'update' },
    };
    const planned = ACTION_PATCH[action];
    if (!planned) {
      return NextResponse.json(
        { success: false, msg: `Unknown action: ${action}` },
        { status: 400 }
      );
    }
    const { error: actionError } = await tryWriteOne(
      adminSupabase
        .schema('communication').from('sms_conversations')
        .update(planned.patch)
        .eq('id', conversationId)
        .select('id'),
      { action: planned.verb, noun: 'conversation' },
    );
    if (actionError) {
      return NextResponse.json(
        { success: false, msg: actionError.message },
        { status: writeFailureStatus(actionError) }
      );
    }

    return NextResponse.json({
      success: true,
      msg: `Conversation ${action} successful`,
    });
  } catch (err) {
    console.error('Error in conversations POST:', err);
    return NextResponse.json(
      { success: false, msg: 'Internal server error' },
      { status: 500 }
    );
  }
}
