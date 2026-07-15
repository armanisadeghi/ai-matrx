/**
 * Feedback Notification API Route
 *
 * Sends email notifications to users when their feedback item status changes.
 * Follows the same pattern as /api/sharing/notify
 *
 * POST /api/feedback/notify
 * Body: { feedback_id: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/adminClient';
import { createClient } from '@/utils/supabase/server';
import { sendEmail, emailTemplates } from '@/lib/email/client';

/**
 * Check if user has feedback email notifications enabled
 */
async function checkFeedbackEmailPreferences(
    supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
    userId: string
): Promise<boolean> {
    try {
        const { data } = await supabase
            .schema('users').from('user_email_preferences')
            .select('feedback_notifications')
            .eq('user_id', userId)
            .single();

        // Default to true if no preferences found
        return data?.feedback_notifications !== false;
    } catch (error) {
        console.error('Error checking feedback email preferences:', error);
        return true; // Default to sending if error
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();

        // Verify authentication
        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

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
            typeof feedback_id !== 'string' ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(feedback_id)
        ) {
            return NextResponse.json(
                { success: false, error: 'A valid feedback_id is required' },
                { status: 400 }
            );
        }

        // Fetch the feedback item
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

        const admin = createAdminClient();

        // Check if user wants feedback notifications after RLS has established
        // that the caller may view this feedback item.
        const shouldSendEmail = await checkFeedbackEmailPreferences(admin, feedback.user_id);
        if (!shouldSendEmail) {
            return NextResponse.json({
                success: true,
                skipped: true,
                reason: 'User has disabled feedback notifications',
            });
        }

        const { data: recipient, error: recipientError } =
            await admin.auth.admin.getUserById(feedback.user_id);
        const recipientEmail = recipient.user?.email;

        if (recipientError || !recipientEmail) {
            console.warn('No email found for user:', feedback.user_id);
            return NextResponse.json(
                { success: false, error: 'User email not found' },
                { status: 404 }
            );
        }

        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.aimatrx.com';
        const portalUrl = `${siteUrl}/settings/feedback`;

        // Prepare email
        const emailContent = emailTemplates.feedbackStatusUpdate(
            feedback.username || recipientEmail,
            feedback.feedback_type,
            feedback.description,
            feedback.status,
            feedback.resolution_notes || undefined,
            portalUrl
        );

        // Send email
        const emailResult = await sendEmail({
            to: recipientEmail,
            subject: emailContent.subject,
            html: emailContent.html,
        });

        if (!emailResult.success) {
            console.error('Failed to send feedback notification:', emailResult.error);
            return NextResponse.json(
                { success: false, error: 'Failed to send email' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            emailSent: true,
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
