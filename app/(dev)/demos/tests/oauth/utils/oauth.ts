import { OAuthProviderConfig } from '../types/oauth';

/**
 * Initiates OAuth flow for the specified provider
 */
export function startOAuthFlow(provider: OAuthProviderConfig): void {
  if (!provider.clientId) {
    console.error(`${provider.name} client ID is not configured.`);
    return;
  }

  // Build the authorization URL
  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: provider.redirectUri,
    scope: provider.scopes.join(provider.scopeDelimiter),
  });

  // Add any additional parameters
  if (provider.additionalParams) {
    Object.entries(provider.additionalParams).forEach(([key, value]) => {
      params.append(key, value);
    });
  }

  const authUrl = `${provider.authUrl}?${params.toString()}`;

  console.log(`Starting OAuth flow for ${provider.name}`, authUrl);

  // Redirect to the authorization URL
  window.location.href = authUrl;
}

/**
 * Exchanges an authorization code for a token
 */
export async function exchangeCodeForToken(provider: string, code: string) {
  console.log(`Exchanging code for ${provider} token`);

  try {
    const response = await fetch(`/app_callback/${provider}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error(`Error exchanging code for ${provider} token:`, errorData);
      throw new Error(errorData.error || `Failed to authenticate with ${provider}`);
    }

    const data = await response.json();
    console.log(`Successfully exchanged code for ${provider} token`);
    return data;
  } catch (error) {
    console.error(`Error exchanging code for ${provider} token:`, error);
    throw error;
  }
}