// app/api/auth/extension/generate-code/route.ts

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { randomBytes } from 'crypto';
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { ensureOrgIdServer } from "@/lib/organizations/ensureOrgId";
import {
  isOrganizationRequiredServerError,
  organizationRequiredResponse,
} from "@/lib/organizations/organizationRequiredResponse";

/**
 * Generate Extension Auth Code
 *
 * Creates a short-lived code that the Chrome extension can exchange for a session.
 *
 * Flow:
 * 1. User authenticated in web app
 * 2. Call this endpoint to generate code (naming the organization it acts in)
 * 3. Show code to user
 * 4. User enters code in extension
 * 5. Extension calls /exchange to get session
 *
 * 🚨 THE ROW IS FILED IN THE ORGANIZATION THE REQUEST NAMES (2026-09-28).
 * `extend.extension_auth_codes.organization_id` is NOT NULL and nothing stamps
 * it, so the caller states it on `X-Organization-Id` (or `organization_id` in
 * the body) — resolved through `ensureOrgIdServer`, which REFUSES with the
 * caller's memberships (`organization_required`) when none is named. Never
 * picked for them. The person is `created_by`; the table has no `user_id`.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await getClaimsUser(supabase);

    if (error || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please log in first' },
        { status: 401 }
      );
    }

    const body = (await request.json().catch(() => null)) as { organization_id?: unknown } | null;
    const bodyOrganizationId =
      typeof body?.organization_id === 'string' ? body.organization_id.trim() || undefined : undefined;
    const headerOrganizationId = request.headers.get('X-Organization-Id')?.trim() || undefined;
    if (bodyOrganizationId && headerOrganizationId && bodyOrganizationId !== headerOrganizationId) {
      return NextResponse.json(
        { error: 'This request names two different organizations. Choose the one you are working in and try again.' },
        { status: 400 }
      );
    }
    const organizationId = await ensureOrgIdServer(supabase, headerOrganizationId ?? bodyOrganizationId);

    // The write goes through the service client (only `service_role` may
    // insert here under RLS), so membership is proven first, as the person.
    const { data: membership, error: membershipError } = await supabase
      .schema('iam').from('organization_member')
      .select('organization_id')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (membershipError) {
      console.error('Error checking organization membership:', membershipError);
      return NextResponse.json({ error: 'Failed to generate code' }, { status: 500 });
    }
    if (!membership) {
      return NextResponse.json(
        { error: 'You are not a member of that organization. Choose one you belong to and try again.' },
        { status: 403 }
      );
    }

    // Generate secure random code
    const code = randomBytes(16).toString('hex').toUpperCase(); // 32 char hex
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store code in database
    const { error: insertError } = await createAdminClient()
      .schema('extend').from('extension_auth_codes')
      .insert({
        code,
        created_by: user.id,
        organization_id: organizationId,
        expires_at: expiresAt.toISOString(),
        used: false,
      });

    if (insertError) {
      console.error('Error storing auth code:', insertError);
      return NextResponse.json(
        { error: 'Failed to generate code' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      code,
      expiresAt: expiresAt.toISOString(),
      expiresIn: 300, // seconds
    });

  } catch (error) {
    // The organization refusal is an answer (with the caller's memberships),
    // not a failure: the client holds the action, asks, and retries.
    if (isOrganizationRequiredServerError(error)) {
      return organizationRequiredResponse(error);
    }
    console.error('Error generating extension auth code:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
