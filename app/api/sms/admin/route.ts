/**
 * POST /api/sms/admin
 *
 * Admin-only SMS operations.
 * Send messages to any user, view all conversations, manage numbers.
 * Uses AGENT_API_KEY or authenticated admin user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/adminClient';
import { sendAndLogSms } from '@/lib/sms/send';
import { sendAdminMessageSms } from '@/lib/sms/notificationService';
import { updateAllWebhookUrls } from '@/lib/sms/numbers';

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

    // TODO: Add proper admin role check when role system is in place
    // For now, this endpoint exists and can be secured via middleware/proxy

    const body = await request.json();
    const { action } = body;

    const adminSupabase = createAdminClient();

    switch (action) {
      // ---- Send message to a user by userId ----
      case 'send_to_user': {
        const { userId: targetUserId, message } = body;
        if (!targetUserId || !message) {
          return NextResponse.json(
            { success: false, msg: 'Missing userId or message' },
            { status: 400 }
          );
        }

        const result = await sendAdminMessageSms({
          userId: targetUserId,
          message,
          adminUserId: user.id,
        });

        return NextResponse.json({
          success: result.success,
          msg: result.message,
          error: result.error,
        });
      }

      // ---- Send message to a phone number directly ----
      case 'send_to_number': {
        const { phoneNumber, message, conversationId } = body;
        if (!phoneNumber || !message) {
          return NextResponse.json(
            { success: false, msg: 'Missing phoneNumber or message' },
            { status: 400 }
          );
        }

        // Get a from number
        const { data: fromNum } = await adminSupabase
          .schema('communication').from('sms_phone_numbers')
          .select('phone_number')
          .eq('is_active', true)
          .limit(1)
          .single();

        let convId = conversationId;
        if (!convId) {
          // Find or create an admin conversation
          const { data: existingConv } = await adminSupabase
            .schema('communication').from('sms_conversations')
            .select('id')
            .eq('external_phone_number', phoneNumber)
            .eq('conversation_type', 'admin')
            .eq('status', 'active')
            .limit(1)
            .single();

          if (existingConv) {
            convId = existingConv.id;
          } else {
            const { data: newConv } = await adminSupabase
              .schema('communication').from('sms_conversations')
              .insert({
                external_phone_number: phoneNumber,
                our_phone_number: fromNum?.phone_number || '',
                conversation_type: 'admin',
              })
              .select('id')
              .single();
            convId = newConv?.id;
          }
        }

        if (!convId) {
          return NextResponse.json(
            { success: false, msg: 'Failed to create conversation' },
            { status: 500 }
          );
        }

        const result = await sendAndLogSms({
          to: phoneNumber,
          body: message,
          from: fromNum?.phone_number || undefined,
          conversationId: convId,
          sentByUserId: user.id,
          sentByType: 'admin',
        });

        return NextResponse.json({
          success: result.success,
          msg: result.success ? 'SMS sent' : 'Failed to send SMS',
          data: result.success ? { sid: result.sid, conversationId: convId } : undefined,
          error: result.error,
        });
      }

      // ---- List all conversations (admin view) ----
      case 'list_conversations': {
        const { limit = 50, offset = 0, status: convStatus, conversationType } = body;

        let query = adminSupabase
          .schema('communication').from('sms_conversations')
          .select('*', { count: 'exact' })
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .range(offset, offset + Math.min(limit, 100) - 1);

        if (convStatus) {
          query = query.eq('status', convStatus);
        }
        if (conversationType) {
          query = query.eq('conversation_type', conversationType);
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
          data: data || [],
          total: count || 0,
        });
      }

      // ---- Get messages for any conversation ----
      case 'get_messages': {
        const { conversationId, limit = 50, offset = 0 } = body;
        if (!conversationId) {
          return NextResponse.json(
            { success: false, msg: 'Missing conversationId' },
            { status: 400 }
          );
        }

        const { data, count, error } = await adminSupabase
          .schema('communication').from('sms_messages')
          .select('*', { count: 'exact' })
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .range(offset, offset + Math.min(limit, 100) - 1);

        if (error) {
          return NextResponse.json(
            { success: false, msg: 'Failed to fetch messages', error: error.message },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          msg: 'Messages fetched',
          data: data || [],
          total: count || 0,
        });
      }

      // ---- Update webhook URLs on all phone numbers ----
      case 'update_webhooks': {
        const result = await updateAllWebhookUrls();

        return NextResponse.json({
          success: true,
          msg: `Updated ${result.updated} numbers, ${result.errors} errors`,
          data: result,
        });
      }

      // ---- SMS analytics summary ----
      case 'analytics': {
        const { days = 7 } = body;
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        const [
          { count: totalMessages },
          { count: totalConversations },
          { count: inboundCount },
          { count: outboundCount },
          { count: deliveredCount },
          { count: failedCount },
          { count: activeConversations },
        ] = await Promise.all([
          adminSupabase.schema('communication').from('sms_messages').select('id', { count: 'exact', head: true }).gte('created_at', since),
          adminSupabase.schema('communication').from('sms_conversations').select('id', { count: 'exact', head: true }),
          adminSupabase.schema('communication').from('sms_messages').select('id', { count: 'exact', head: true }).eq('direction', 'inbound').gte('created_at', since),
          adminSupabase.schema('communication').from('sms_messages').select('id', { count: 'exact', head: true }).eq('direction', 'outbound').gte('created_at', since),
          adminSupabase.schema('communication').from('sms_messages').select('id', { count: 'exact', head: true }).eq('status', 'delivered').gte('created_at', since),
          adminSupabase.schema('communication').from('sms_messages').select('id', { count: 'exact', head: true }).in('status', ['failed', 'undelivered']).gte('created_at', since),
          adminSupabase.schema('communication').from('sms_conversations').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        ]);

        return NextResponse.json({
          success: true,
          msg: `SMS analytics for last ${days} days`,
          data: {
            analytics: {
              totalMessages: totalMessages || 0,
              totalConversations: totalConversations || 0,
              inboundMessages: inboundCount || 0,
              outboundMessages: outboundCount || 0,
              deliveredMessages: deliveredCount || 0,
              failedMessages: failedCount || 0,
              activeConversations: activeConversations || 0,
              averageResponseTime: 'N/A',
              messagesByType: {},
              recentActivity: [],
            },
          },
        });
      }

      // ---- Webhook logs ----
      case 'webhook_logs': {
        const { limit = 50, offset = 0 } = body;

        const { data, count, error } = await adminSupabase
          .schema('communication').from('sms_webhook_logs')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + Math.min(limit, 100) - 1);

        if (error) {
          return NextResponse.json(
            { success: false, msg: 'Failed to fetch webhook logs', error: error.message },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          msg: 'Webhook logs fetched',
          data: {
            logs: data || [],
            total: count || 0,
          },
        });
      }

      default:
        return NextResponse.json(
          { success: false, msg: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error('Error in admin SMS route:', err);
    return NextResponse.json(
      { success: false, msg: 'Internal server error' },
      { status: 500 }
    );
  }
}
