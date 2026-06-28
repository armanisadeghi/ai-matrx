/**
 * Sharing Notification API Route
 * 
 * Handles sending email notifications when resources are shared
 * This must run on the server to access EMAIL_FROM and RESEND_API_KEY
 * 
 * Environment variables needed:
 * - RESEND_API_KEY=re_xxxxxxxxxxxx
 * - EMAIL_FROM=AI Matrx <noreply@aimatrx.com>
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { sendEmail, emailTemplates } from '@/lib/email/client';

interface ResourceDetails {
  title: string;
  url: string;
}

/**
 * Get resource details for email
 */
async function getResourceDetails(
  supabase: any,
  resourceType: string,
  resourceId: string
): Promise<ResourceDetails | null> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.aimatrx.com';

  try {
    switch (resourceType) {
      case 'prompt': {
        // TODO(prompt-to-agent-sweep): public.prompts is graveyarded.
        // Re-wire to agent.definition (same UUIDs) when the migration completes.
        console.warn('[sharing/notify] prompt sharing notification skipped — public.prompts graveyarded');
        return null;
      }

      case 'canvas': {
        const { data } = await supabase
          .from('canvases')
          .select('title')
          .eq('id', resourceId)
          .single();
        
        return data
          ? {
              title: data.title || 'Untitled Canvas',
              url: `${siteUrl}/canvases/${resourceId}`,
            }
          : null;
      }

      case 'collection': {
        const { data } = await supabase
          .from('collections')
          .select('name')
          .eq('id', resourceId)
          .single();
        
        return data
          ? {
              title: data.name || 'Untitled Collection',
              url: `${siteUrl}/collections/${resourceId}`,
            }
          : null;
      }

      case 'note': {
        const { data } = await supabase
          .schema("workbench").from('notes')
          .select('title')
          .eq('id', resourceId)
          .single();
        
        return data
          ? {
              title: data.title || 'Untitled Note',
              url: `${siteUrl}/notes/${resourceId}`,
            }
          : null;
      }

      default:
        return {
          title: `Shared ${resourceType}`,
          url: `${siteUrl}/${resourceType}s/${resourceId}`,
        };
    }
  } catch (error) {
    console.error('Error fetching resource details:', error);
    return null;
  }
}

/**
 * Check if user has email notifications enabled for sharing
 */
async function checkEmailPreferences(supabase: any, userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .schema('users').from('user_email_preferences')
      .select('sharing_notifications')
      .eq('user_id', userId)
      .single();

    // Default to true if no preferences found
    return data?.sharing_notifications !== false;
  } catch (error) {
    console.error('Error checking email preferences:', error);
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
    const { recipientUserId, resourceType, resourceId, sharerName, message } = body;

    // Validate input
    if (!recipientUserId || !resourceType || !resourceId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: recipientUserId, resourceType, resourceId' },
        { status: 400 }
      );
    }

    // Check if user wants email notifications
    const shouldSendEmail = await checkEmailPreferences(supabase, recipientUserId);
    if (!shouldSendEmail) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'User has disabled sharing notifications',
      });
    }

    // Get recipient email using RPC function (securely accesses auth.users)
    const { data: usersData, error: rpcError } = await supabase
      .rpc('get_user_emails_by_ids', { user_ids: [recipientUserId] });

    if (rpcError || !usersData || usersData.length === 0 || !usersData[0]?.email) {
      console.warn('No email found for user:', recipientUserId);
      return NextResponse.json(
        { success: false, error: 'User email not found' },
        { status: 404 }
      );
    }

    const userData = usersData[0];

    // Get resource details
    const resourceDetails = await getResourceDetails(supabase, resourceType, resourceId);
    if (!resourceDetails) {
      console.warn('Could not fetch resource details:', { resourceType, resourceId });
      return NextResponse.json(
        { success: false, error: 'Resource details not found' },
        { status: 404 }
      );
    }

    // Prepare email template
    const emailTemplate = emailTemplates.resourceShared(
      sharerName || 'Someone',
      resourceType,
      resourceDetails.title,
      resourceDetails.url,
      message
    );

    // Send email
    const emailResult = await sendEmail({
      to: userData.email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    if (!emailResult.success) {
      console.error('Failed to send sharing notification:', emailResult.error);
      return NextResponse.json(
        { success: false, error: 'Failed to send email' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      emailSent: true,
    });
  } catch (error: any) {
    console.error('Error in POST /api/sharing/notify:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to send sharing notification',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
