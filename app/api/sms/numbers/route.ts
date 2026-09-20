/**
 * GET /api/sms/numbers
 * POST /api/sms/numbers
 *
 * Phone number management for SMS.
 * Admin-only operations (purchase, assign, release).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/adminClient';
import {
  searchAvailableNumbers,
  purchasePhoneNumber,
  assignPhoneNumberToUser,
  releasePhoneNumber,
  listPhoneNumbers,
} from '@/lib/sms/numbers';
import { ensureOrgIdServer } from '@/lib/organizations/personalOrg';
import {
  isOrganizationRequiredServerError,
  organizationRequiredResponse,
} from '@/lib/organizations/organizationRequiredResponse';
import { getClaimsUser } from "@/utils/supabase/resolveUser";

/**
 * GET /api/sms/numbers
 * List phone numbers. Users see their own, admins see all.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await getClaimsUser(supabase);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, msg: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Search for available numbers to purchase
    if (action === 'search') {
      const areaCode = searchParams.get('areaCode') || undefined;
      const country = searchParams.get('country') || 'US';

      const numbers = await searchAvailableNumbers({ areaCode, country });

      return NextResponse.json({
        success: true,
        msg: 'Available numbers fetched',
        data: numbers,
      });
    }

    // List owned numbers
    const numbers = await listPhoneNumbers({ userId: user.id, isActive: true });

    return NextResponse.json({
      success: true,
      msg: 'Phone numbers fetched',
      data: numbers,
    });
  } catch (err) {
    console.error('Error in numbers GET:', err);
    return NextResponse.json(
      { success: false, msg: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sms/numbers
 * Purchase, assign, or release phone numbers.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await getClaimsUser(supabase);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, msg: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'purchase': {
        const { phoneNumber, friendlyName } = body;
        if (!phoneNumber) {
          return NextResponse.json(
            { success: false, msg: 'Missing phoneNumber' },
            { status: 400 }
          );
        }

        // 🚨 A PURCHASED NUMBER IS REGISTERED TO AN ORGANIZATION, AND THE
        // CALLER NAMES IT (2026-09-19 ruling). Until the 2026-09-19 review
        // `purchasePhoneNumber` filed the number in the buyer's PERSONAL
        // workspace, which then silently decided where every inbound text on
        // that number would land for the life of the number. Nothing is
        // substituted: the caller states the organization on
        // `X-Organization-Id` — the header every Matrx client carries — and
        // with none the purchase is REFUSED before a number is bought, with
        // the caller's memberships attached so the person can choose and
        // retry. Refusing BEFORE the Twilio call is deliberate: a refusal
        // after it would have spent money on a number with no home.
        const actingOrganizationId =
          request.headers.get('X-Organization-Id')?.trim() || undefined;
        const organizationId = await ensureOrgIdServer(supabase, actingOrganizationId);

        const result = await purchasePhoneNumber(
          organizationId,
          phoneNumber,
          user.id,
          friendlyName,
        );

        if (!result.success) {
          return NextResponse.json(
            { success: false, msg: 'Failed to purchase number', error: result.error },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          msg: 'Phone number purchased',
          data: result.data,
        });
      }

      case 'assign': {
        const { phoneNumberId, userId: assignToUserId } = body;
        if (!phoneNumberId) {
          return NextResponse.json(
            { success: false, msg: 'Missing phoneNumberId' },
            { status: 400 }
          );
        }

        const result = await assignPhoneNumberToUser(
          phoneNumberId,
          assignToUserId || user.id
        );

        if (!result.success) {
          return NextResponse.json(
            { success: false, msg: 'Failed to assign number', error: result.error },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          msg: 'Phone number assigned',
        });
      }

      case 'release': {
        const { phoneNumberId } = body;
        if (!phoneNumberId) {
          return NextResponse.json(
            { success: false, msg: 'Missing phoneNumberId' },
            { status: 400 }
          );
        }

        const result = await releasePhoneNumber(phoneNumberId);

        if (!result.success) {
          return NextResponse.json(
            { success: false, msg: 'Failed to release number', error: result.error },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          msg: 'Phone number released',
        });
      }

      default:
        return NextResponse.json(
          { success: false, msg: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    // The organization refusal is an ANSWER, not a server fault: it carries
    // the caller's memberships so the client can hold the request, open the
    // picker, and replay it with what the person set. Swallowing it into the
    // 500 below would turn "name your organization" into a dead end.
    if (isOrganizationRequiredServerError(err)) {
      return organizationRequiredResponse(err);
    }
    console.error('Error in numbers POST:', err);
    return NextResponse.json(
      { success: false, msg: 'Internal server error' },
      { status: 500 }
    );
  }
}
