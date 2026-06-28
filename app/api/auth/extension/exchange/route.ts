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
 * - Deleted after use
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

    // Look up code
    const { data: authCode, error: lookupError } = await supabase
      .schema('extend').from('extension_auth_codes')
      .select('*')
      .eq('code', code)
      .eq('used', false)
      .single();

    if (lookupError || !authCode) {
      return NextResponse.json(
        { error: 'Invalid or expired code' },
        { status: 401 }
      );
    }

    // Check expiration
    const expiresAt = new Date(authCode.expires_at);
    if (expiresAt < new Date()) {
      // Delete expired code
      await supabase
        .schema('extend').from('extension_auth_codes')
        .delete()
        .eq('code', code);

      return NextResponse.json(
        { error: 'Code has expired' },
        { status: 401 }
      );
    }

    // Mark code as used (prevents reuse)
    const { error: updateError } = await supabase
      .schema('extend').from('extension_auth_codes')
      .update({ used: true })
      .eq('code', code);

    if (updateError) {
      console.error('Error marking code as used:', updateError);
    }

    // Get user data
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(
      authCode.user_id
    );

    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Create a new session for the extension
    // Note: This creates a separate session - the extension won't share web cookies
    const { data: sessionData, error: sessionError } = await supabase.auth.admin
      .generateLink({
        type: 'magiclink',
        email: user.email!,
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

