/**
 * GET /api/sms/conversations
 * POST /api/sms/conversations
 *
 * List and manage SMS conversations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/adminClient';

/**
 * GET /api/sms/conversations
 * List conversations for the authenticated user.
 * Admin users can see all conversations with ?admin=true.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

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
    const { data: { user }, error: authError } = await supabase.auth.getUser();

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

    switch (action) {
      case 'close':
        await adminSupabase
          .schema('communication').from('sms_conversations')
          .update({ status: 'closed' })
          .eq('id', conversationId);
        break;

      case 'block':
        await adminSupabase
          .schema('communication').from('sms_conversations')
          .update({ status: 'blocked' })
          .eq('id', conversationId);
        break;

      case 'reopen':
        await adminSupabase
          .schema('communication').from('sms_conversations')
          .update({ status: 'active' })
          .eq('id', conversationId);
        break;

      case 'mark_read':
        await adminSupabase
          .schema('communication').from('sms_conversations')
          .update({ unread_count: 0 })
          .eq('id', conversationId);
        break;

      default:
        return NextResponse.json(
          { success: false, msg: `Unknown action: ${action}` },
          { status: 400 }
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
