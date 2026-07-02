// app/(public)/app_callback/route.ts
import { NextRequest, NextResponse } from "next/server";

// This is just a general idea of how this could be set up.


// Configuration for each provider (could be in a separate config file)
const providerConfig = {
  notion: {
    clientId: process.env.NOTION_CLIENT_ID,
    clientSecret: process.env.NOTION_CLIENT_SECRET,
    tokenEndpoint: "https://api.notion.com/v1/oauth/token",
    redirectUri: `${process.env.NEXT_PUBLIC_BASE_URL}/app_callback`,
  },
  github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    tokenEndpoint: "https://github.com/login/oauth/access_token",
    redirectUri: `${process.env.NEXT_PUBLIC_BASE_URL}/app_callback`,
  },
  slack: {
    clientId: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET,
    tokenEndpoint: "https://slack.com/api/oauth.v2.access",
    redirectUri: `${process.env.NEXT_PUBLIC_BASE_URL}/app_callback`,
  },
  // Add more providers here
} satisfies Record<string, { clientId: string | undefined; clientSecret: string | undefined; tokenEndpoint: string; redirectUri: string }>;

// Generic handler for GET requests
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // Optional, for CSRF protection
  const provider = searchParams.get("provider"); // Custom param to identify the provider

  // Validate required params
  if (!code || !provider || !providerConfig[provider as keyof typeof providerConfig]) {
    return NextResponse.json({ error: "Invalid callback parameters" }, { status: 400 });
  }

  const config = providerConfig[provider as keyof typeof providerConfig];

  if (!config.clientId || !config.clientSecret) {
    console.error(`Missing OAuth client credentials for provider: ${provider}`);
    return NextResponse.json({ error: "Provider not configured" }, { status: 500 });
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch(config.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error("Failed to exchange code for token");
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Here, you can store the token (e.g., in a database) or pass it to the client
    // For simplicity, redirect to a success page with the provider and token
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL}/success?provider=${provider}&token=${accessToken}`
    );
  } catch (error) {
    console.error(`Error in ${provider} callback:`, error);
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}