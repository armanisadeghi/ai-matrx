import { NextResponse } from "next/server";
import {
  loadAdminOrganizationDirectory,
  manageAdminOrganizationMembership,
} from "@/features/admin/users/server/organizationMembershipAdmin";
import { isOrgRole } from "@/features/organizations/types";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message.startsWith("Unauthorized")
    ? 401
    : message.startsWith("Forbidden")
      ? 403
      : 400;
  return NextResponse.json({ error: message }, { status });
}

async function parseMembershipRequest(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    organizationId?: unknown;
    userId?: unknown;
    role?: unknown;
  } | null;

  if (
    !body ||
    typeof body.organizationId !== "string" ||
    typeof body.userId !== "string"
  ) {
    throw new Error("organizationId and userId are required");
  }

  return body;
}

export async function GET() {
  try {
    await requireSuperAdmin();
    return NextResponse.json({
      directory: await loadAdminOrganizationDirectory(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireSuperAdmin();
    const body = await parseMembershipRequest(request);
    if (typeof body.role !== "string" || !isOrgRole(body.role)) {
      throw new Error("role must be owner, admin, or member");
    }
    const result = await manageAdminOrganizationMembership({
      action: "add",
      organizationId: body.organizationId as string,
      userId: body.userId as string,
      role: body.role,
    });
    return NextResponse.json({ result });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireSuperAdmin();
    const body = await parseMembershipRequest(request);
    if (typeof body.role !== "string" || !isOrgRole(body.role)) {
      throw new Error("role must be owner, admin, or member");
    }
    const result = await manageAdminOrganizationMembership({
      action: "set_role",
      organizationId: body.organizationId as string,
      userId: body.userId as string,
      role: body.role,
    });
    return NextResponse.json({ result });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireSuperAdmin();
    const body = await parseMembershipRequest(request);
    const result = await manageAdminOrganizationMembership({
      action: "remove",
      organizationId: body.organizationId as string,
      userId: body.userId as string,
    });
    return NextResponse.json({ result });
  } catch (error) {
    return errorResponse(error);
  }
}
