/**
 * Feedback status notice.
 *
 * Tells the reporter their feedback item's status changed, through the
 * notification spine (`feedback.status_updated`): email plus the paired DM.
 *
 * POST /api/feedback/notify
 * Body: { feedback_id: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/adminClient';
import { createClient } from '@/utils/supabase/server';
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { isRfc4122Uuid } from "@ai-matrx/kit/uuid";
import {
    accountEmail,
    legacyEmailOptOut,
    notifyFromSql,
    preview,
} from "@/lib/notifications/notifyFromSql";

const STATUS_LABELS: Record<string, string> = {
    in_progress: 'In Progress',
    awaiting_review: 'Fix Ready - Under Review',
    resolved: 'Resolved',
    closed: 'Closed',
    wont_fix: "Won't Fix",
};

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();

        // Verify authentication
        const {
            data: { user },
            error: userError,
        } = await getClaimsUser(supabase);

        if (userError || !user) {
            return NextResponse.json(
                { success: false, error: 'User not authenticated' },
                { status: 401 }
            );
        }

        // Parse request body
        const body = await request.json();
        const { feedback_id } = body as { feedback_id?: unknown };

        if (
            !isRfc4122Uuid(feedback_id)
        ) {
            return NextResponse.json(
                { success: false, error: 'A valid feedback_id is required' },
                { status: 400 }
            );
        }

        // Fetch the feedback item (RLS proves the caller may view it).
        const { data: feedback, error: fetchError } = await supabase
            .schema('users').from('user_feedback')
            .select('*')
            .eq('id', feedback_id)
            .single();

        if (fetchError || !feedback) {
            return NextResponse.json(
                { success: false, error: 'Feedback item not found' },
                { status: 404 }
            );
        }
        if (!feedback.user_id || !feedback.organization_id) {
            return NextResponse.json({
                success: true,
                skipped: true,
                reason: 'This feedback item has no reporter or organization to tell',
            });
        }

        const admin = createAdminClient();
        const recipientEmail = await accountEmail(admin, feedback.user_id);
        const status = String(feedback.status);
        const result = await notifyFromSql(admin, {
            organizationId: feedback.organization_id,
            eventKey: 'feedback.status_updated',
            recipientUserId: feedback.user_id,
            toAddress: recipientEmail,
            payload: {
                feedback: {
                    type: String(feedback.feedback_type),
                    status: STATUS_LABELS[status] || status,
                    username: feedback.username || recipientEmail || 'there',
                    description: preview(String(feedback.description), 200),
                    resolution_line: feedback.resolution_notes
                        ? `Resolution notes: ${feedback.resolution_notes}`
                        : 'No resolution notes yet.',
                    next_step:
                        status === 'resolved'
                            ? 'If the fix looks good, you can confirm it in the feedback portal.'
                            : 'You can track all your feedback items in the feedback portal.',
                },
            },
            deepLink: '/user-settings/feedback',
            targetKind: 'feedback',
            targetId: feedback.id,
            dedupeKey: `feedback.status_updated:${feedback.id}:${status}`,
            optedOut: await legacyEmailOptOut(admin, feedback.user_id, 'feedback_notifications'),
        });

        return NextResponse.json({
            success: true,
            emailSent: result.queued.includes('email'),
            queued: result.queued,
            skipped: result.skipped,
            say: result.say,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to send feedback notification';
        console.error('Error in POST /api/feedback/notify:', error);
        return NextResponse.json(
            { success: false, error: message },
            { status: 500 }
        );
    }
}
