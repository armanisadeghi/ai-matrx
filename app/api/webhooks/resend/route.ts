import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import crypto from "crypto";

/**
 * POST /api/webhooks/resend
 * Handle incoming email webhooks from Resend
 * 
 * Webhook events: https://resend.com/docs/api-reference/webhooks/webhook-events
 */
export async function POST(request: Request) {
  try {
    // Get the raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get("svix-signature");
    const timestamp = request.headers.get("svix-timestamp");
    const id = request.headers.get("svix-id");

    // Verify webhook signature (if configured)
    if (process.env.RESEND_WEBHOOK_SECRET) {
      if (!signature || !timestamp || !id) {
        return NextResponse.json(
          { error: "Missing webhook headers" },
          { status: 400 }
        );
      }

      // Verify the signature
      const isValid = verifyWebhookSignature(
        body,
        signature,
        timestamp,
        id,
        process.env.RESEND_WEBHOOK_SECRET
      );

      if (!isValid) {
        console.error("Invalid webhook signature");
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 }
        );
      }
    }

    // Parse the webhook payload
    const payload = JSON.parse(body);
    const { type, data } = payload;

    console.log("Resend webhook received:", type);

    // Handle different webhook events
    switch (type) {
      case "email.sent":
        await handleEmailSent(data);
        break;
      
      case "email.delivered":
        await handleEmailDelivered(data);
        break;
      
      case "email.delivery_delayed":
        await handleEmailDelayed(data);
        break;
      
      case "email.complained":
        await handleEmailComplained(data);
        break;
      
      case "email.bounced":
        await handleEmailBounced(data);
        break;
      
      case "email.opened":
        await handleEmailOpened(data);
        break;
      
      case "email.clicked":
        await handleEmailClicked(data);
        break;

      default:
        console.log("Unhandled webhook type:", type);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

/**
 * Verify webhook signature using HMAC
 */
function verifyWebhookSignature(
  body: string,
  signature: string,
  timestamp: string,
  id: string,
  secret: string
): boolean {
  try {
    // Construct the signed content
    const signedContent = `${id}.${timestamp}.${body}`;
    
    // Compute the expected signature
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(signedContent)
      .digest("base64");

    // Extract the signature from the header (format: "v1,signature")
    const signatures = signature.split(",");
    for (const sig of signatures) {
      const [version, value] = sig.split("=");
      if (version === "v1" && value === expectedSignature) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error("Error verifying signature:", error);
    return false;
  }
}

/**
 * Handle email sent event
 */
async function handleEmailSent(data: any) {
  console.log("Email sent:", data.email_id);
  // You can track email sending status here
}

/**
 * Handle email delivered event
 */
async function handleEmailDelivered(data: any) {
  console.log("Email delivered:", data.email_id);
  // Update delivery status in database if needed
}

/**
 * Handle email delayed event
 */
async function handleEmailDelayed(data: any) {
  console.log("Email delayed:", data.email_id);
  // Log delivery delays for monitoring
}

/**
 * Handle email complained (spam report) event
 */
async function handleEmailComplained(data: any) {
  console.warn("Email complained:", data.email_id);
  
  try {
    const adminSupabase = createAdminClient();
    
    // Mark user as unsubscribed from emails
    const { error } = await adminSupabase
      .schema("users").from("user_email_preferences")
      .update({
        sharing_notifications: false,
        organization_invitations: false,
        resource_updates: false,
        marketing_emails: false,
        weekly_digest: false,
      })
      .eq("user_id", data.to);

    if (error) {
      console.error("Error updating email preferences after complaint:", error);
    }
  } catch (error) {
    console.error("Error handling email complaint:", error);
  }
}

/**
 * Handle email bounced event
 */
async function handleEmailBounced(data: any) {
  console.warn("Email bounced:", data.email_id, data.bounce_type);
  
  try {
    const adminSupabase = createAdminClient();
    
    // If hard bounce, mark email as invalid
    if (data.bounce_type === "hard") {
      // You could add a bounced_emails table to track this
      console.log("Hard bounce detected for:", data.to);
    }
  } catch (error) {
    console.error("Error handling email bounce:", error);
  }
}

/**
 * Handle email opened event
 */
async function handleEmailOpened(data: any) {
  console.log("Email opened:", data.email_id);
  // Track email opens for analytics if needed
}

/**
 * Handle email clicked event
 */
async function handleEmailClicked(data: any) {
  console.log("Email link clicked:", data.email_id, data.link);
  // Track link clicks for analytics if needed
}

/**
 * GET /api/webhooks/resend
 * Webhook endpoint info
 */
export async function GET() {
  return NextResponse.json({
    webhook: "Resend Email Webhook",
    endpoints: [
      "POST /api/webhooks/resend - Handle webhook events",
    ],
    events: [
      "email.sent",
      "email.delivered",
      "email.delivery_delayed",
      "email.complained",
      "email.bounced",
      "email.opened",
      "email.clicked",
    ],
    documentation: "https://resend.com/docs/api-reference/webhooks",
  });
}
