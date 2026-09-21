import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { sendCommentNotificationEmail } from "@/lib/email/notificationService";
import { getClaimsUser } from "@/utils/supabase/resolveUser";

/**
 * POST /api/notifications/comment-added
 * Send comment notification email
 */
/**
 * The organization a commentable resource is filed under, or null when this platform
 * does not know one. Never guesses: a null goes to
 * `platform.link_carries_its_organization`, which returns the link untouched.
 */
async function resolveResourceOrganization(
  supabase: Awaited<ReturnType<typeof createClient>>,
  resourceType: string,
  resourceId: string,
): Promise<string | null> {
  const source: Record<string, { schema: string; table: string }> = {
    canvas: { schema: "canvas", table: "canvas_items" },
    note: { schema: "workbench", table: "notes" },
  };
  const where = source[resourceType];
  if (!where) return null;
  try {
    const { data } = await supabase
      .schema(where.schema as never)
      .from(where.table)
      .select("organization_id")
      .eq("id", resourceId)
      .single();
    return (data as { organization_id?: string | null } | null)?.organization_id ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await getClaimsUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, msg: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const {
      resourceOwnerId,
      commentText,
      resourceTitle,
      resourceType,
      resourceId,
    } = body;

    if (
      !resourceOwnerId ||
      !commentText ||
      !resourceTitle ||
      !resourceType ||
      !resourceId
    ) {
      return NextResponse.json(
        {
          success: false,
          msg: "resourceOwnerId, commentText, resourceTitle, resourceType, and resourceId are required",
        },
        { status: 400 },
      );
    }

    // Don't send notification if commenting on your own resource
    if (resourceOwnerId === user.id) {
      return NextResponse.json({
        success: true,
        msg: "Self-comment, no notification needed",
        skipped: true,
      });
    }

    // Get commenter's name
    const { data: commenterProfile } = await supabase
      .schema("users").from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    const commenterName =
      commenterProfile?.display_name ||
      (typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : null) ||
      "Someone";

    // THE LINK MUST NAME THE ORGANIZATION THE RESOURCE IS FILED UNDER. The owner
    // follows this link COLD, out of an email, possibly while working in a different
    // organization — the arrival TAILS-3 measured landing on "Select an organization
    // first". `/tasks` is declared organization-free (it is the same personal list from
    // every organization), and a resource type with no backing table yet resolves to
    // null, which the rule handles by returning the link unchanged rather than
    // inventing an organization.
    const organizationId = await resolveResourceOrganization(
      supabase,
      resourceType,
      resourceId,
    );

    const result = await sendCommentNotificationEmail({
      resourceOwnerId,
      organizationId,
      commenterName,
      commentText,
      resourceTitle,
      resourceType,
      resourceId,
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        msg: result.message,
        skipped: result.skipped,
      });
    }

    return NextResponse.json(
      { success: false, msg: result.message, error: result.error },
      { status: 500 },
    );
  } catch (error) {
    console.error("Error in POST /api/notifications/comment-added:", error);
    return NextResponse.json(
      { success: false, msg: "Failed to send notification" },
      { status: 500 },
    );
  }
}
