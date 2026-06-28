// features/sharing/emailService.ts
// Email service for sharing notifications

import { sendEmail, emailTemplates } from "@/lib/email/client";
import { createClient } from "@/utils/supabase/client";

interface SendSharingNotificationOptions {
  recipientUserId: string;
  resourceType: string;
  resourceId: string;
  sharerName: string;
  message?: string;
}

interface ResourceDetails {
  title: string;
  url: string;
}

/**
 * Get resource details for email
 */
async function getResourceDetails(
  resourceType: string,
  resourceId: string,
): Promise<ResourceDetails | null> {
  const supabase = createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.aimatrx.com";

  try {
    switch (resourceType) {
      case "prompt": {
        // TODO(prompt-to-agent-sweep): public.prompts is graveyarded.
        // Prompt sharing notifications are temporarily disabled until the lookup
        // is re-wired to agent.definition (same UUIDs, agent_type varies).
        console.warn("[emailService] prompt sharing notification skipped — public.prompts graveyarded");
        return null;
      }

      case "canvas": {
        const { data } = await supabase
          .schema("canvas").from("canvas_items")
          .select("title")
          .eq("id", resourceId)
          .single();

        return data
          ? {
              title: data.title ?? "Untitled Canvas",
              url: `${siteUrl}/canvases/${resourceId}`,
            }
          : null;
      }

      case "collection":
      case "udt_picklists": {
        const { data } = await supabase
          .schema("workbench")
          .from("udt_picklists")
          .select("list_name")
          .eq("id", resourceId)
          .single();

        return data
          ? {
              title: data.list_name ?? "Untitled List",
              url: `${siteUrl}/lists/${resourceId}`,
            }
          : null;
      }

      case "udt_datasets": {
        const { data } = await supabase
          .schema("workbench")
          .from("udt_datasets")
          .select("table_name")
          .eq("id", resourceId)
          .single();

        return data
          ? {
              title: data.table_name ?? "Untitled Dataset",
              url: `${siteUrl}/data/${resourceId}`,
            }
          : null;
      }

      case "note": {
        const { data } = await supabase
          .schema("workbench").from("notes")
          .select("label")
          .eq("id", resourceId)
          .single();

        return data
          ? {
              title: data.label || "Untitled Note",
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
    console.error("Error fetching resource details:", error);
    return null;
  }
}

/**
 * Check if user has email notifications enabled for sharing
 */
async function checkEmailPreferences(userId: string): Promise<boolean> {
  const supabase = createClient();

  try {
    const { data } = await supabase
      .schema("users").from("user_email_preferences")
      .select("sharing_notifications")
      .eq("user_id", userId)
      .single();

    // Default to true if no preferences found
    return data?.sharing_notifications !== false;
  } catch (error) {
    console.error("Error checking email preferences:", error);
    return true; // Default to sending if error
  }
}

/**
 * Send sharing notification email
 */
export async function sendSharingNotification(
  options: SendSharingNotificationOptions,
): Promise<{ success: boolean; error?: unknown }> {
  const { recipientUserId, resourceType, resourceId, sharerName, message } =
    options;

  try {
    const supabase = createClient();

    // Check if user wants email notifications
    const shouldSendEmail = await checkEmailPreferences(recipientUserId);
    if (!shouldSendEmail) {
      return { success: true }; // User opted out, consider it a success
    }

    // Get recipient email using RPC function (securely accesses auth.users)
    const { data: usersData, error: userError } = await supabase.rpc(
      "get_user_emails_by_ids",
      { user_ids: [recipientUserId] },
    );

    if (
      userError ||
      !usersData ||
      usersData.length === 0 ||
      !usersData[0]?.email
    ) {
      console.warn("No email found for user:", recipientUserId);
      return { success: false, error: "User email not found" };
    }

    const userData = usersData[0];

    // Get resource details
    const resourceDetails = await getResourceDetails(resourceType, resourceId);
    if (!resourceDetails) {
      console.warn("Could not fetch resource details:", {
        resourceType,
        resourceId,
      });
      return { success: false, error: "Resource details not found" };
    }

    // Send email
    const emailTemplate = emailTemplates.resourceShared(
      sharerName,
      resourceType,
      resourceDetails.title,
      resourceDetails.url,
      message,
    );

    const result = await sendEmail({
      to: userData.email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    return result;
  } catch (error) {
    console.error("Error sending sharing notification:", error);
    return { success: false, error };
  }
}

/**
 * Batch send sharing notifications to multiple users
 */
export async function sendBatchSharingNotifications(
  recipientUserIds: string[],
  resourceType: string,
  resourceId: string,
  sharerName: string,
  message?: string,
): Promise<{ successful: number; failed: number }> {
  const results = await Promise.allSettled(
    recipientUserIds.map((userId) =>
      sendSharingNotification({
        recipientUserId: userId,
        resourceType,
        resourceId,
        sharerName,
        message,
      }),
    ),
  );

  const successful = results.filter(
    (r) => r.status === "fulfilled" && r.value.success,
  ).length;
  const failed = results.length - successful;

  return { successful, failed };
}
