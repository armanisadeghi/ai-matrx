import { NextRequest, NextResponse } from 'next/server';
import { WebClient } from '@slack/web-api';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  
  // Determine the redirect base path (should be the Slack page, not root)
  const redirectBase = '/tests/slack/with-brokers';
  
  // Get the origin from the request for redirecting back to the application
  const origin = request.headers.get('host') 
    ? `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('host')}`
    : 'https://www.aimatrx.com';

  if (error) {
    return NextResponse.redirect(new URL(`${redirectBase}?error=${error}`, origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL(`${redirectBase}?error=missing_code`, origin));
  }

  try {
    const client = new WebClient();
    
    // Use the exact redirect URL that's configured in the Slack app
    // This should match what's in your Slack app settings
    const slackRedirectUrl = process.env.SLACK_REDIRECT_URL + '/api/slack/oauth/callback';
    
    if (!process.env.SLACK_CLIENT_ID || !process.env.SLACK_CLIENT_SECRET) {
      console.error('Missing Slack OAuth credentials');
      return NextResponse.redirect(new URL(`${redirectBase}?error=missing_credentials`, origin));
    }
    
    const result = await client.oauth.v2.access({
      client_id: process.env.SLACK_CLIENT_ID,
      client_secret: process.env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: slackRedirectUrl
    });

    if (!result.ok) {
      throw new Error(result.error as string);
    }

    // Redirect back to the Slack page with the token
    const botToken = result.access_token;
    return NextResponse.redirect(new URL(`${redirectBase}?token=${botToken}`, origin));
  } catch (error: unknown) {
    console.error('OAuth error:', error);
    // Include more detailed error info for debugging
    const errorMsg = error instanceof Error ? encodeURIComponent(error.message) : 'oauth_failure';
    return NextResponse.redirect(new URL(`${redirectBase}?error=${errorMsg}`, origin));
  }
}