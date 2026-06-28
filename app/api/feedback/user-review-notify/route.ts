/**
 * User Review Notification API Route
 *
 * Sends email notifications for user review messages:
 * - Admin sends message to user → email the user
 * - User replies → email the admin
 *
 * POST /api/feedback/user-review-notify
 * Body: {
 *   feedback_id: string,
 *   message_id: string,
 *   message_content: string,
 *   sender_type: 'admin' | 'user',
 *   sender_name: string,
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { sendEmail, emailTemplates } from '@/lib/email/client';

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

        const body = await request.json();
        const { feedback_id, message_id, message_content, sender_type, sender_name } = body as {
            feedback_id: string;
            message_id: string;
            message_content: string;
            sender_type: 'admin' | 'user';
            sender_name: string;
        };

        if (!feedback_id || !message_content || !sender_type) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields' },
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

        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.aimatrx.com';

        if (sender_type === 'admin') {
            // Admin sent a message → email the user
            // Check if user wants feedback notifications
            const { data: prefs } = await supabase
                .schema('users').from('user_email_preferences')
                .select('feedback_notifications')
                .eq('user_id', feedback.user_id)
                .single();

            if (prefs?.feedback_notifications === false) {
                return NextResponse.json({
                    success: true,
                    skipped: true,
                    reason: 'User has disabled feedback notifications',
                });
            }

            // Get user email
            const { data: usersData, error: rpcError } = await supabase
                .rpc('get_user_emails_by_ids', { user_ids: [feedback.user_id] });

            if (rpcError || !usersData || usersData.length === 0 || !usersData[0]?.email) {
                return NextResponse.json(
                    { success: false, error: 'User email not found' },
                    { status: 404 }
                );
            }

            const recipientEmail = usersData[0].email;
            const portalUrl = `${siteUrl}/settings/feedback`;

            const emailContent = emailTemplates.feedbackUserReviewMessage(
                feedback.username || recipientEmail,
                feedback.feedback_type,
                feedback.description,
                message_content,
                sender_name || 'Admin',
                portalUrl
            );

            const emailResult = await sendEmail({
                to: recipientEmail,
                subject: emailContent.subject,
                html: emailContent.html,
            });

            if (!emailResult.success) {
                console.error('Failed to send user review notification:', emailResult.error);
                return NextResponse.json(
                    { success: false, error: 'Failed to send email' },
                    { status: 500 }
                );
            }

            // Mark message as emailed
            if (message_id) {
                await supabase.rpc('mark_user_message_emailed', { p_message_id: message_id });
            }

            return NextResponse.json({ success: true, emailSent: true });

        } else {
            // User replied → email the admin(s)
            // For now, email the site admin email
            const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_FROM;
            if (!adminEmail) {
                console.warn('No admin email configured');
                return NextResponse.json({
                    success: true,
                    skipped: true,
                    reason: 'No admin email configured',
                });
            }

            const adminPortalUrl = `${siteUrl}/administration/feedback`;
            const username = feedback.username || 'User';

            const emailContent = emailTemplates.feedbackUserReply(
                'Admin',
                feedback.feedback_type,
                feedback.description,
                message_content,
                username,
                adminPortalUrl
            );

            const emailResult = await sendEmail({
                to: adminEmail.includes('<') ? adminEmail : adminEmail,
                subject: emailContent.subject,
                html: emailContent.html,
            });

            if (!emailResult.success) {
                console.error('Failed to send admin notification:', emailResult.error);
                return NextResponse.json(
                    { success: false, error: 'Failed to send email' },
                    { status: 500 }
                );
            }

            // Mark message as emailed
            if (message_id) {
                await supabase.rpc('mark_user_message_emailed', { p_message_id: message_id });
            }

            return NextResponse.json({ success: true, emailSent: true });
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to send notification';
        console.error('Error in POST /api/feedback/user-review-notify:', error);
        return NextResponse.json(
            { success: false, error: message },
            { status: 500 }
        );
    }
}
