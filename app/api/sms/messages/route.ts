/**
 * GET /api/sms/messages?conversationId=xxx
 *
 * Fetch messages for a conversation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/adminClient';

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
    const conversationId = searchParams.get('conversationId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (!conversationId) {
      return NextResponse.json(
        { success: false, msg: 'Missing conversationId parameter' },
        { status: 400 }
      );
    }

    const adminSupabase = createAdminClient();

    // Verify user owns this conversation
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

    // Fetch messages
    const { data, count, error } = await adminSupabase
      .schema('communication').from('sms_messages')
      .select('*', { count: 'exact' })
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json(
        { success: false, msg: 'Failed to fetch messages', error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      msg: 'Messages fetched',
      data: {
        messages: data || [],
        total: count || 0,
      },
    });
  } catch (err) {
    console.error('Error in messages GET:', err);
    return NextResponse.json(
      { success: false, msg: 'Internal server error' },
      { status: 500 }
    );
  }
}
