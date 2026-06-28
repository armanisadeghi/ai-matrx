// app/api/auth/extension/generate-code/route.ts

import { NextResponse } from 'next/server';
import { createClient } from "@/utils/supabase/server";
import { randomBytes } from 'crypto';

/**
 * Generate Extension Auth Code
 * 
 * Creates a short-lived code that the Chrome extension can exchange for a session.
 * 
 * Flow:
 * 1. User authenticated in web app
 * 2. Call this endpoint to generate code
 * 3. Show code to user
 * 4. User enters code in extension
 * 5. Extension calls /exchange to get session
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please log in first' },
        { status: 401 }
      );
    }

    // Generate secure random code
    const code = randomBytes(16).toString('hex').toUpperCase(); // 32 char hex
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store code in database
    const { error: insertError } = await supabase
      .schema('extend').from('extension_auth_codes')
      .insert({
        code,
        user_id: user.id,
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
    console.error('Error generating extension auth code:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

