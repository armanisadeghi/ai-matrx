import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { sendCommentNotificationEmail } from "@/lib/email/notificationService";
import { getClaimsUser } from "@/utils/supabase/resolveUser";

type ResourceType = "task" | "canvas" | "note";

const resources: Record<ResourceType, { schema: string; table: string; title: string }> = {
  task: { schema: "workspace", table: "tasks", title: "title" },
  canvas: { schema: "canvas", table: "canvas_items", title: "title" },
  note: { schema: "workbench", table: "notes", title: "label" },
};

/** A follow-up email can describe only a comment and resource already saved. */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await getClaimsUser(supabase);
    if (!user) {
      return NextResponse.json({ success: false, msg: "Unauthorized" }, { status: 401 });
    }

    const { commentId } = await request.json() as { commentId?: unknown };
    if (typeof commentId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(commentId)) {
      return NextResponse.json({ success: false, msg: "A saved comment ID is required" }, { status: 400 });
    }

    const { data: comment, error: commentError } = await supabase
      .schema("platform").from("comments")
      .select("id, organization_id, entity_type, entity_id, body, created_by")
      .eq("id", commentId).is("deleted_at", null).maybeSingle();
    if (commentError) throw commentError;
    if (!comment || comment.created_by !== user.id ||
        !Object.hasOwn(resources, comment.entity_type)) {
      return NextResponse.json({ success: false, msg: "Saved comment not found" }, { status: 404 });
    }

    const resourceType = comment.entity_type as ResourceType;
    const source = resources[resourceType];
    const { data: resource, error: resourceError } = await supabase
      .schema(source.schema as never).from(source.table as never)
      .select(`id, organization_id, created_by, ${source.title}`)
      .eq("id", comment.entity_id).is("deleted_at", null).maybeSingle();
    if (resourceError) throw resourceError;
    const savedResource = resource as unknown as Record<string, string | null> | null;
    if (!savedResource || savedResource.organization_id !== comment.organization_id ||
        !savedResource.created_by) {
      return NextResponse.json({ success: false, msg: "Commented resource not found" }, { status: 404 });
    }
    if (savedResource.created_by === user.id) {
      return NextResponse.json({ success: true, msg: "Self-comment, no notification needed", skipped: true });
    }

    const { data: commenterProfile } = await supabase
      .schema("users").from("profiles")
      .select("display_name").eq("id", user.id).maybeSingle();
    const result = await sendCommentNotificationEmail({
      resourceOwnerId: savedResource.created_by,
      organizationId: comment.organization_id,
      commenterName: commenterProfile?.display_name || "Someone",
      commentText: comment.body,
      resourceTitle: savedResource[source.title] || resourceType,
      resourceType,
      resourceId: comment.entity_id,
    });
    return NextResponse.json(
      { success: result.success, msg: result.message, skipped: result.skipped, error: result.error },
      { status: result.success ? 200 : 500 },
    );
  } catch (error) {
    console.error("Error in POST /api/notifications/comment-added:", error);
    return NextResponse.json({ success: false, msg: "Failed to send notification" }, { status: 500 });
  }
}
