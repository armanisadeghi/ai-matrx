import { OAuthProviderConfig } from "../types/oauth";

// Provider configurations - Simplified to only include Slack
export const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  slack: {
    name: "Slack",
    clientId: process.env.NEXT_PUBLIC_SLACK_CLIENT_ID,
    authUrl: "https://slack.com/oauth/v2/authorize",
    redirectUri: `${process.env.NEXT_PUBLIC_SLACK_REDIRECT_URL}/app_callback/slack`,
    scopes: ["app_mentions:read", "channels:read", "chat:write", "commands", "files:read", "files:write", "users:read", "groups:read"],
    scopeDelimiter: ",",
    color: "purple-600",
    textColor: "white",
    additionalParams: {
      // Response type is required for Slack OAuth v2
      response_type: "code",
    },
    iconSvg: (
        <svg
            viewBox="0 0 24 24"
            className="w-6 h-6 fill-current"
            xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.687 8.834a2.528 2.528 0 0 1-2.521 2.521 2.527 2.527 0 0 1-2.521-2.521V2.522A2.527 2.527 0 0 1 15.166 0a2.528 2.528 0 0 1 2.521 2.522v6.312zM15.166 18.956a2.528 2.528 0 0 1 2.521 2.522A2.528 2.528 0 0 1 15.166 24a2.527 2.527 0 0 1-2.521-2.522v-2.522h2.521zM15.166 17.687a2.527 2.527 0 0 1-2.521-2.521 2.526 2.526 0 0 1 2.521-2.521h6.312A2.527 2.527 0 0 1 24 15.166a2.528 2.528 0 0 1-2.522 2.521h-6.312z" />
        </svg>
    ),
  },
  // Extension point for future providers
  // Uncomment and modify when adding new providers
  /*
  new_provider: {
    name: "New Provider",
    clientId: process.env.NEXT_PUBLIC_NEW_PROVIDER_CLIENT_ID,
    authUrl: "https://provider.com/oauth/authorize",
    redirectUri: `${process.env.NEXT_PUBLIC_NEW_PROVIDER_REDIRECT_URL}/app_callback/new_provider`,
    scopes: ["scope1", "scope2"],
    scopeDelimiter: " ",
    color: "blue-600",
    textColor: "white",
    additionalParams: {
      response_type: "code",
    },
    iconSvg: (
      <svg
        viewBox="0 0 24 24"
        className="w-6 h-6 fill-current"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="..." />
      </svg>
    ),
  },
  */
};