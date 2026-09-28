// app/api/auth/extension/exchange/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from "@/utils/supabase/server";

/**
 * Exchange Extension Auth Code for Session
 * 
 * Chrome extension calls this with the code to get a valid session.
 * 
 * Security:
 * - Code is single-use
 * - Expires after 5 minutes
 * - A request must atomically claim the live, unused code before it can mint a session
 */
export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Code is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Read only a live code so a soft-deleted credential can never be exchanged.
    const { data: authCode, error: lookupError } = await supabase
      .schema('extend').from('extension_auth_codes')
      .select('*')
      .eq('code', code)
      .is('deleted_at', null)
      .maybeSingle();

    if (lookupError || !authCode || authCode.used) {
      return NextResponse.json(
        { error: 'Invalid or expired code' },
        { status: 401 }
      );
    }

    // Check expiration
    const expiresAt = new Date(authCode.expires_at);
    if (expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Code has expired' },
        { status: 401 }
      );
    }

    // This is the one-time credential claim. Reading `used=false` above is not
    // sufficient: two exchanges can both read it. Only the request whose
    // conditional update returns a row may proceed to mint a session.
    const { data: claimedCode, error: claimError } = await supabase
      .schema('extend').from('extension_auth_codes')
      .update({ used: true })
      .eq('code', code)
      .eq('used', false)
      .is('deleted_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('user_id, expires_at')
      .maybeSingle();

    if (claimError || !claimedCode) {
      // Fail closed: a replay, concurrent winner, deletion, expiry, or write
      // failure never reaches the privileged session-minting branch.
      return NextResponse.json(
        { error: 'Invalid or expired code' },
        { status: 401 }
      );
    }

    // Get user data
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(
      claimedCode.user_id
    );

    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    if (!user.email) {
      return NextResponse.json(
        { error: 'User has no email on file — extension sign-in requires an email-based account' },
        { status: 400 }
      );
    }

    // Create a new session for the extension
    // Note: This creates a separate session - the extension won't share web cookies
    const { data: sessionData, error: sessionError } = await supabase.auth.admin
      .generateLink({
        type: 'magiclink',
        email: user.email,
      });

    if (sessionError || !sessionData) {
      console.error('Error generating session:', sessionError);
      return NextResponse.json(
        { error: 'Failed to create session' },
        { status: 500 }
      );
    }

    // Clean up used codes older than 1 hour
    await supabase
      .schema('extend').from('extension_auth_codes')
      .delete()
      .lt('expires_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        // Add other safe user fields as needed
      },
      session: sessionData,
    });

  } catch (error) {
    console.error('Error exchanging extension auth code:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
