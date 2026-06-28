import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { createClient } from "@/utils/supabase/server";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";
import { sendInvitationRequestApprovalEmail, sendInvitationRequestRejectionEmail } from "@/features/invitations/emailService";

/**
 * PATCH /api/admin/invitation-requests/[id]
 * Approve or reject an invitation request
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Verify admin access
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json(
        { success: false, msg: "Unauthorized" },
        { status: 401 }
      );
    }

    // Highest-bar gate: Super Admin only.
    const adminSupabase = createAdminClient();
    const isSuperAdmin = await checkIsSuperAdmin(adminSupabase, authUser.id);

    if (!isSuperAdmin) {
      return NextResponse.json(
        { success: false, msg: "Forbidden - Super Admin access required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action, notes, rejectionReason } = body;

    if (!action || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { success: false, msg: "Invalid action. Must be 'approve' or 'reject'" },
        { status: 400 }
      );
    }

    // Get the invitation request
    const { data: invitationRequest, error: fetchError } = await adminSupabase
      .schema("user")
      .from("invitation_requests")
      .select("*")
      .eq("id", params.id)
      .single();

    if (fetchError || !invitationRequest) {
      return NextResponse.json(
        { success: false, msg: "Invitation request not found" },
        { status: 404 }
      );
    }

    if (action === "approve") {
      // Generate invitation code
      const { data: codeData, error: codeError } = await adminSupabase.rpc(
        "generate_invitation_code"
      );

      if (codeError || !codeData) {
        console.error("Error generating invitation code:", codeError);
        return NextResponse.json(
          { success: false, msg: "Failed to generate invitation code" },
          { status: 500 }
        );
      }

      const invitationCode = codeData as string;

      // Create invitation code record
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiry

      const { error: insertError } = await adminSupabase
        .schema("user")
        .from("invitation_codes")
        .insert({
          code: invitationCode,
          invitation_request_id: params.id,
          created_by: authUser.id,
          expires_at: expiresAt.toISOString(),
          max_uses: 1,
          status: "active",
        });

      if (insertError) {
        console.error("Error creating invitation code:", insertError);
        return NextResponse.json(
          { success: false, msg: "Failed to create invitation code" },
          { status: 500 }
        );
      }

      // Update invitation request status
      const { error: updateError } = await adminSupabase
        .schema("user")
        .from("invitation_requests")
        .update({
          status: "approved",
          reviewed_by: authUser.id,
          reviewed_at: new Date().toISOString(),
          notes: notes || null,
        })
        .eq("id", params.id);

      if (updateError) {
        console.error("Error updating invitation request:", updateError);
        return NextResponse.json(
          { success: false, msg: "Failed to update invitation request" },
          { status: 500 }
        );
      }

      // Send approval email
      const emailResult = await sendInvitationRequestApprovalEmail({
        fullName: invitationRequest.full_name,
        email: invitationRequest.email,
        invitationCode,
      });

      if (!emailResult.success) {
        console.warn("Failed to send approval email:", emailResult.error);
        // Don't fail the request if email fails
      }

      return NextResponse.json({
        success: true,
        msg: "Invitation request approved and code sent",
        data: { invitationCode, emailSent: emailResult.success },
      });
    } else {
      // Reject
      const { error: updateError } = await adminSupabase
        .schema("user")
        .from("invitation_requests")
        .update({
          status: "rejected",
          reviewed_by: authUser.id,
          reviewed_at: new Date().toISOString(),
          notes: notes || null,
        })
        .eq("id", params.id);

      if (updateError) {
        console.error("Error updating invitation request:", updateError);
        return NextResponse.json(
          { success: false, msg: "Failed to update invitation request" },
          { status: 500 }
        );
      }

      // Send rejection email
      const emailResult = await sendInvitationRequestRejectionEmail({
        fullName: invitationRequest.full_name,
        email: invitationRequest.email,
        reason: rejectionReason,
      });

      if (!emailResult.success) {
        console.warn("Failed to send rejection email:", emailResult.error);
        // Don't fail the request if email fails
      }

      return NextResponse.json({
        success: true,
        msg: "Invitation request rejected",
        data: { emailSent: emailResult.success },
      });
    }
  } catch (error) {
    console.error("Error in PATCH /api/admin/invitation-requests/[id]:", error);
    return NextResponse.json(
      { success: false, msg: "Failed to process request" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/invitation-requests/[id]
 * Get a specific invitation request
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Verify admin access
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json(
        { success: false, msg: "Unauthorized" },
        { status: 401 }
      );
    }

    // Highest-bar gate: Super Admin only.
    const adminSupabase = createAdminClient();
    const isSuperAdmin = await checkIsSuperAdmin(adminSupabase, authUser.id);

    if (!isSuperAdmin) {
      return NextResponse.json(
        { success: false, msg: "Forbidden - Super Admin access required" },
        { status: 403 }
      );
    }

    // Get the invitation request
    const { data: invitationRequest, error } = await adminSupabase
      .schema("user")
      .from("invitation_requests")
      .select("*")
      .eq("id", params.id)
      .single();

    if (error || !invitationRequest) {
      return NextResponse.json(
        { success: false, msg: "Invitation request not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: invitationRequest,
    });
  } catch (error) {
    console.error("Error in GET /api/admin/invitation-requests/[id]:", error);
    return NextResponse.json(
      { success: false, msg: "Failed to fetch request" },
      { status: 500 }
    );
  }
}
