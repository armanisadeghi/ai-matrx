import { NextRequest, NextResponse } from 'next/server';

// Provider-specific configuration types
interface ProviderConfig {
  clientId: string | undefined;
  clientSecret: string | undefined;
  tokenUrl: string;
  redirectUri: string;
  bodyFormat: 'json' | 'form';
  headers?: Record<string, string>;
  processResponseData?: (data: unknown) => unknown;
}

// Provider configurations - Simplified to only include Slack
const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  slack: {
    clientId: process.env.SLACK_CLIENT_ID, // Server-side env variable
    clientSecret: process.env.SLACK_CLIENT_SECRET,
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    redirectUri: `${process.env.SLACK_REDIRECT_URL}/app_callback/slack`,
    bodyFormat: 'form',
    headers: {
      'Accept': 'application/json',
    },
    processResponseData: (data) => {
      const payload = data as { ok?: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error || 'Slack API error');
      }
      console.log('Slack app installed successfully:', data);
      return data;
    }
  },
  // Extension point for future providers
  /*
  new_provider: {
    clientId: process.env.NEW_PROVIDER_CLIENT_ID,
    clientSecret: process.env.NEW_PROVIDER_CLIENT_SECRET,
    tokenUrl: 'https://provider.com/oauth/token',
    redirectUri: `${process.env.NEW_PROVIDER_REDIRECT_URL}/app_callback/new_provider`,
    bodyFormat: 'json',
    headers: {
      'Accept': 'application/json',
    }
  },
  */
};

export async function POST(
    request: NextRequest,
    { params }: { params: { provider: string } }
) {
  try {
    const provider = params.provider.toLowerCase();
    const body = await request.json();
    const { code } = body;

    console.log(`Processing ${provider} OAuth code exchange`);

    // Validate request
    if (!code) {
      console.error('Missing authorization code');
      return NextResponse.json(
          { error: 'Authorization code is required' },
          { status: 400 }
      );
    }

    // Check if provider is supported
    if (!PROVIDER_CONFIGS[provider]) {
      console.error(`Unsupported provider: ${provider}`);
      return NextResponse.json(
          { error: `Unsupported provider: ${provider}` },
          { status: 400 }
      );
    }

    const config = PROVIDER_CONFIGS[provider];
    const { clientId, clientSecret, tokenUrl, redirectUri, bodyFormat, headers, processResponseData } = config;

    // Validate provider configuration
    if (!clientId || !clientSecret) {
      console.error(`${provider} client credentials are not configured`);
      throw new Error(`${provider} client credentials are not configured`);
    }

    console.log(`Exchanging code for ${provider} token...`);

    // Prepare request headers
    const requestHeaders: Record<string, string> = {
      'Content-Type': bodyFormat === 'json'
          ? 'application/json'
          : 'application/x-www-form-urlencoded',
      ...(headers || {})
    };

    // Prepare request body
    let requestBody;
    if (bodyFormat === 'json') {
      requestBody = JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      });
    } else {
      const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      });
      requestBody = params.toString();
    }

    // Exchange the code for a token
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: requestBody
    });

    // Log response status
    console.log(`${provider} token exchange response status:`, response.status);

    // Handle response errors
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${provider} token exchange failed:`, errorText);

      let errorMessage;
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error_description || errorData.error || `Failed to exchange code: ${response.status}`;
      } catch {
        errorMessage = `Failed to exchange code: ${response.status} ${errorText}`;
      }

      return NextResponse.json({ error: errorMessage }, { status: response.status });
    }

    // Parse and process response data
    let responseData = await response.json();
    console.log(`${provider} token exchange successful`);

    // Apply provider-specific response processing if needed
    if (processResponseData) {
      try {
        responseData = processResponseData(responseData);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Error processing response';
        console.error(`${provider} response processing error:`, errorMessage);
        return NextResponse.json({ error: errorMessage }, { status: 400 });
      }
    }

    // Return the successful response
    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// This handles the initial redirect from Slack
export async function GET(
    request: NextRequest,
    { params }: { params: { provider: string } }
) {
  const provider = params.provider.toLowerCase();
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  console.log(`Received ${provider} OAuth callback`, { code: code ? 'present' : 'missing', error });

  if (error) {
    // Redirect to the home page with the error
    return NextResponse.redirect(
        new URL(`/?provider=${provider}&error=${error}`, request.url)
    );
  }

  if (!code) {
    // Redirect to the home page with an error for missing code
    return NextResponse.redirect(
        new URL(`/?provider=${provider}&error=missing_code`, request.url)
    );
  }

  // Redirect to the home page with the code
  return NextResponse.redirect(
      new URL(`/?provider=${provider}&code=${code}`, request.url)
  );
}