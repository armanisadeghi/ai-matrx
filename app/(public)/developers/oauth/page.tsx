import { Metadata } from "next";
import {
  ShieldCheck,
  Key,
  Code2,
  RefreshCw,
  Globe,
  Lock,
  BookOpen,
  ArrowRight,
  Cpu,
  Users,
  ShieldAlert,
  LogIn,
} from "lucide-react";

export const metadata: Metadata = {
  title: "OAuth 2.1 Developer Guide | AI Matrx",
  description:
    'Integrate with AI Matrx using OAuth 2.1 and OpenID Connect. Build "Sign in with AI Matrx" or authenticate AI agents via MCP.',
  openGraph: {
    title: "OAuth 2.1 Developer Guide | AI Matrx",
    description: "Integrate with AI Matrx using OAuth 2.1 and OpenID Connect.",
  },
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = "https://www.aimatrx.com";

const STANDARD_ENDPOINTS = [
  { label: "Authorization", url: `${BASE_URL}/api/oauth/authorize` },
  { label: "Token", url: `${BASE_URL}/api/oauth/token` },
  { label: "UserInfo", url: `${BASE_URL}/api/oauth/userinfo` },
  { label: "JWKS", url: `${BASE_URL}/api/oauth/jwks` },
  {
    label: "OIDC Discovery",
    url: `${BASE_URL}/.well-known/openid-configuration`,
  },
  {
    label: "OAuth Discovery",
    url: `${BASE_URL}/.well-known/oauth-authorization-server/auth/v1`,
  },
  {
    label: "Dynamic Registration",
    url: `${BASE_URL}/api/oauth/clients/register`,
  },
];

const ADMIN_ENDPOINTS = [
  {
    label: "Authorization (Admin)",
    url: `${BASE_URL}/api/oauth/authorize-admin`,
  },
  { label: "Token (Admin)", url: `${BASE_URL}/api/oauth/token-admin` },
];

const SCOPES = [
  {
    name: "openid",
    description:
      "Enables OpenID Connect. An ID token will be included in the token response.",
  },
  {
    name: "email",
    description: "Access to the user's email address and verification status.",
  },
  {
    name: "profile",
    description: "Access to the user's name and profile picture.",
  },
  {
    name: "phone",
    description: "Access to the user's phone number and verification status.",
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OAuthDeveloperDocs() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
        {/* Hero */}
        <header className="mb-12">
          <div className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 mb-3">
            <BookOpen className="h-4 w-4" />
            Developer Documentation
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white tracking-tight mb-4">
            OAuth 2.1 Integration Guide
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 leading-relaxed max-w-3xl">
            AI Matrx acts as an OAuth 2.1 and OpenID Connect identity provider.
            Third-party apps can use AI Matrx accounts to authenticate their
            users — similar to &quot;Sign in with Google&quot;, but powered by
            AI Matrx.
          </p>
        </header>

        {/* ================================================================
                    CRITICAL DISTINCTION CALLOUT
                ================================================================ */}
        <section className="mb-14">
          <div className="rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Two completely separate things — do not confuse them
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-lg bg-white dark:bg-neutral-800 border border-blue-100 dark:border-neutral-700 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <LogIn className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <span className="font-semibold text-gray-900 dark:text-white text-sm">
                    How AI Matrx users log in
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  Users logging into AI Matrx itself use email, phone, Google,
                  GitHub, and other social providers. This is handled entirely
                  by AI Matrx — developers do not need to configure anything for
                  this.
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 font-medium">
                  Not documented here. This is internal to AI Matrx.
                </p>
              </div>
              <div className="rounded-lg bg-white dark:bg-neutral-800 border border-blue-100 dark:border-neutral-700 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Key className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="font-semibold text-gray-900 dark:text-white text-sm">
                    AI Matrx as YOUR OAuth provider
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  Your app can use AI Matrx as an identity provider. When your
                  users click &quot;Sign in with AI Matrx&quot;, they
                  authenticate with their AI Matrx account and your app receives
                  a token. This is what this page documents.
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 font-medium">
                  ← You are here. Read on.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================
                    INTEGRATION TYPES
                ================================================================ */}
        <section className="mb-14">
          <SectionHeading id="integration-types">
            Two Integration Types
          </SectionHeading>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Before you start, determine which type of integration you need. They
            use different endpoints and have different requirements.
          </p>
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Standard Integration
                </h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Any AI Matrx user can authorize your app. Suitable for most
                third-party applications and services.
              </p>
              <div className="rounded-md bg-gray-50 dark:bg-neutral-900 px-3 py-2 font-mono text-xs text-gray-500 dark:text-gray-400">
                /api/oauth/authorize
                <br />
                /api/oauth/token
              </div>
            </div>
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-5">
              <div className="flex items-center gap-2 mb-3">
                <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Admin-Only Integration
                </h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Only users who are AI Matrx administrators can authorize your
                app. Non-admin users are rejected at the token exchange step —
                even if they have a valid AI Matrx account.
              </p>
              <div className="rounded-md bg-gray-50 dark:bg-neutral-900 px-3 py-2 font-mono text-xs text-amber-700 dark:text-amber-400">
                /api/oauth/authorize-admin
                <br />
                /api/oauth/token-admin
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================
                    STANDARD ENDPOINTS
                ================================================================ */}
        <section className="mb-14">
          <SectionHeading id="endpoints">Standard Endpoints</SectionHeading>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Use these endpoints for standard integrations where any AI Matrx
            user can authorize.
          </p>
          <EndpointTable endpoints={STANDARD_ENDPOINTS} />
        </section>

        {/* ================================================================
                    ADMIN ENDPOINTS
                ================================================================ */}
        <section className="mb-14">
          <SectionHeading id="admin-endpoints">
            Admin-Only Endpoints
          </SectionHeading>
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200/70 dark:border-amber-700/40 px-4 py-3 mb-4">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              <strong>Admin-only:</strong> Replace{" "}
              <code className="font-mono text-xs">/api/oauth/authorize</code>{" "}
              with{" "}
              <code className="font-mono text-xs">
                /api/oauth/authorize-admin
              </code>{" "}
              and <code className="font-mono text-xs">/api/oauth/token</code>{" "}
              with{" "}
              <code className="font-mono text-xs">/api/oauth/token-admin</code>.
              Everything else in the flow is identical. Non-admin users receive
              a <code className="font-mono text-xs">403 access_denied</code>{" "}
              error at the token exchange step.
            </p>
          </div>
          <EndpointTable endpoints={ADMIN_ENDPOINTS} highlight="amber" />
        </section>

        {/* ================================================================
                    SCOPES
                ================================================================ */}
        <section className="mb-14">
          <SectionHeading id="scopes">Available Scopes</SectionHeading>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Include scopes as a space-separated string in the{" "}
            <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-neutral-700 text-xs font-mono">
              scope
            </code>{" "}
            parameter. Default when none provided:{" "}
            <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-neutral-700 text-xs font-mono">
              email
            </code>
            .
          </p>
          <div className="space-y-2">
            {SCOPES.map((scope) => (
              <div
                key={scope.name}
                className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-3"
              >
                <code className="shrink-0 mt-0.5 px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-xs font-mono font-semibold text-blue-700 dark:text-blue-300">
                  {scope.name}
                </code>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {scope.description}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ================================================================
                    STANDARD FLOW
                ================================================================ */}
        <section className="mb-14">
          <SectionHeading id="auth-flow">
            Standard Authorization Flow (PKCE)
          </SectionHeading>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            AI Matrx uses the OAuth 2.1 authorization code flow with mandatory
            PKCE. For admin-only integrations, swap the two endpoints noted
            below — everything else is identical.
          </p>

          <div className="space-y-6">
            <FlowStep number={1} title="Generate PKCE Parameters">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Generate a random{" "}
                <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-neutral-700 text-xs font-mono">
                  code_verifier
                </code>{" "}
                and derive a{" "}
                <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-neutral-700 text-xs font-mono">
                  code_challenge
                </code>{" "}
                from it using SHA-256. Most OAuth libraries handle this
                automatically.
              </p>
              <CodeBlock
                language="javascript"
                code={`function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64URLEncode(new Uint8Array(hash));
}

function base64URLEncode(buffer) {
  return btoa(String.fromCharCode(...buffer))
    .replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=/g, '');
}

const codeVerifier = generateCodeVerifier();
sessionStorage.setItem('code_verifier', codeVerifier);
const codeChallenge = await generateCodeChallenge(codeVerifier);`}
              />
            </FlowStep>

            <FlowStep number={2} title="Redirect to Authorization Endpoint">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Redirect the user to the AI Matrx authorization endpoint.
              </p>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Standard
                </span>
              </div>
              <CodeBlock
                language="text"
                code={`${BASE_URL}/api/oauth/authorize?
  response_type=code
  &client_id=YOUR_CLIENT_ID
  &redirect_uri=https://your-app.com/callback
  &state=RANDOM_STATE_STRING
  &code_challenge=CODE_CHALLENGE
  &code_challenge_method=S256
  &scope=openid email profile`}
              />
              <div className="mt-3 mb-2 flex items-center gap-2">
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                  Admin-only — swap the endpoint
                </span>
              </div>
              <CodeBlock
                language="text"
                code={`${BASE_URL}/api/oauth/authorize-admin?
  response_type=code
  &client_id=YOUR_CLIENT_ID
  &redirect_uri=https://your-app.com/callback
  &state=RANDOM_STATE_STRING
  &code_challenge=CODE_CHALLENGE
  &code_challenge_method=S256
  &scope=openid email profile`}
              />
              <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200/70 dark:border-amber-700/40 px-3.5 py-2.5">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  <strong>Required:</strong> response_type, client_id,
                  redirect_uri, code_challenge, code_challenge_method. Always
                  include <code className="font-mono">state</code> for CSRF
                  protection.
                </p>
              </div>
            </FlowStep>

            <FlowStep number={3} title="User Authenticates and Consents">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                AI Matrx shows a login screen (if needed) and a branded consent
                screen where the user approves or denies access. They will see
                your app name, the requested scopes, and your redirect domain.
              </p>
            </FlowStep>

            <FlowStep number={4} title="Handle the Callback">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                After consent, the user is redirected to your{" "}
                <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-neutral-700 text-xs font-mono">
                  redirect_uri
                </code>{" "}
                with an authorization code.
              </p>
              <CodeBlock
                language="text"
                code={`https://your-app.com/callback?code=AUTH_CODE&state=RANDOM_STATE_STRING`}
              />
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">
                If the user denies:
              </p>
              <CodeBlock
                language="text"
                code={`https://your-app.com/callback?error=access_denied&state=RANDOM_STATE_STRING`}
              />
            </FlowStep>

            <FlowStep number={5} title="Exchange Code for Tokens">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Exchange the authorization code for access, refresh, and
                (optionally) ID tokens.
              </p>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Standard
                </span>
              </div>
              <CodeBlock
                language="javascript"
                code={`const response = await fetch('${BASE_URL}/api/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authorizationCode,
    client_id: 'YOUR_CLIENT_ID',
    client_secret: 'YOUR_CLIENT_SECRET',
    redirect_uri: 'https://your-app.com/callback',
    code_verifier: sessionStorage.getItem('code_verifier'),
  }),
});
const tokens = await response.json();
// { access_token, token_type, expires_in, refresh_token, scope, id_token? }`}
              />
              <div className="mt-3 mb-2 flex items-center gap-2">
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                  Admin-only — swap the endpoint, handle 403
                </span>
              </div>
              <CodeBlock
                language="javascript"
                code={`const response = await fetch('${BASE_URL}/api/oauth/token-admin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authorizationCode,
    client_id: 'YOUR_CLIENT_ID',
    client_secret: 'YOUR_CLIENT_SECRET',
    redirect_uri: 'https://your-app.com/callback',
    code_verifier: sessionStorage.getItem('code_verifier'),
  }),
});

if (response.status === 403) {
  // User authenticated successfully but is NOT an AI Matrx admin
  const err = await response.json();
  // err.error === 'access_denied'
  // err.error_description === 'Access is restricted to administrators only.'
  showError('Admin access required.');
  return;
}

const tokens = await response.json();`}
              />
              <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200/70 dark:border-amber-700/40 px-3.5 py-2.5">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  <strong>Admin check:</strong> The token-admin endpoint
                  verifies the user is an AI Matrx administrator after the code
                  is exchanged. If they are not, it returns{" "}
                  <code className="font-mono">403 access_denied</code> and does
                  not issue a token. The user&apos;s AI Matrx session is
                  unaffected.
                </p>
              </div>
            </FlowStep>

            <FlowStep number={6} title="Use the Access Token">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Use the access token to fetch user info or call protected AI
                Matrx APIs.
              </p>
              <CodeBlock
                language="javascript"
                code={`// Fetch user info
const userInfo = await fetch('${BASE_URL}/api/oauth/userinfo', {
  headers: { Authorization: 'Bearer ' + tokens.access_token },
}).then(r => r.json());
// { sub, email, name, picture, ... }`}
              />
            </FlowStep>
          </div>
        </section>

        {/* ================================================================
                    REFRESH TOKENS
                ================================================================ */}
        <section className="mb-14">
          <SectionHeading id="refresh-tokens">Refreshing Tokens</SectionHeading>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Access tokens expire after 1 hour. Use the refresh token to get a
            new one. Use{" "}
            <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-neutral-700 text-xs font-mono">
              /api/oauth/token
            </code>{" "}
            for standard or{" "}
            <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-neutral-700 text-xs font-mono">
              /api/oauth/token-admin
            </code>{" "}
            for admin-only integrations.
          </p>
          <CodeBlock
            language="javascript"
            code={`const response = await fetch('${BASE_URL}/api/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id: 'YOUR_CLIENT_ID',
    client_secret: 'YOUR_CLIENT_SECRET',
  }),
});
const newTokens = await response.json();
// Always store the new refresh_token — it may be rotated.`}
          />
        </section>

        {/* ================================================================
                    TOKEN VALIDATION
                ================================================================ */}
        <section className="mb-14">
          <SectionHeading id="token-validation">
            Token Validation
          </SectionHeading>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Validate access tokens using the JWKS endpoint. AI Matrx uses ES256
            (ECDSA P-256) for JWT signing.
          </p>
          <CodeBlock
            language="javascript"
            code={`import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL('${BASE_URL}/api/oauth/jwks')
);

async function verifyAccessToken(token) {
  const { payload } = await jwtVerify(token, JWKS, {
    audience: 'authenticated',
  });
  return payload; // { sub, email, client_id, exp, ... }
}`}
          />
        </section>

        {/* ================================================================
                    MCP / DYNAMIC REGISTRATION
                ================================================================ */}
        <section className="mb-14">
          <SectionHeading id="mcp">MCP and Dynamic Registration</SectionHeading>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            AI agents and MCP-compatible tools can register themselves
            automatically — no manual setup required. Use the OIDC discovery
            document to find all endpoints.
          </p>
          <CodeBlock
            language="javascript"
            code={`// Dynamic client registration (for AI agents / MCP tools)
const reg = await fetch('${BASE_URL}/api/oauth/clients/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_name: 'My MCP Tool',
    redirect_uris: ['https://my-tool.example.com/callback'],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none', // public client
  }),
});
const client = await reg.json();
// { client_id, client_secret?, ... }`}
          />
        </section>

        {/* ================================================================
                    IMPORTANT NOTES
                ================================================================ */}
        <section className="mb-14">
          <SectionHeading id="important-notes">Important Notes</SectionHeading>
          <div className="space-y-3">
            <NoteCard
              icon={Globe}
              title="Redirect URIs must be exact"
              description="Exact, complete URL matches only — no wildcards. Register every URL you need including protocol, domain, path, and port. Production and local dev URIs must be registered separately."
            />
            <NoteCard
              icon={Lock}
              title="PKCE is mandatory"
              description="All clients must use PKCE with S256. Most OAuth libraries handle this automatically."
            />
            <NoteCard
              icon={RefreshCw}
              title="Refresh tokens may rotate"
              description="Always store the new refresh_token from every token response — the previous one may be invalidated."
            />
            <NoteCard
              icon={Code2}
              title="Authorization codes expire in 10 minutes"
              description="Exchange the code for tokens immediately. Codes are single-use and expire after 10 minutes."
            />
            <NoteCard
              icon={ShieldAlert}
              title="Admin check happens at token exchange, not at login"
              description="With the admin endpoints, the user completes login and sees the consent screen normally. The admin check only fires when the code is exchanged for a token. Non-admins receive a 403 and no token is issued."
            />
          </div>
        </section>

        {/* ================================================================
                    TOKEN CLAIMS
                ================================================================ */}
        <section className="mb-14">
          <SectionHeading id="token-claims">Access Token Claims</SectionHeading>
          <div className="rounded-xl border border-gray-200 dark:border-neutral-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                    Claim
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-neutral-700 bg-white dark:bg-neutral-800/50">
                {[
                  ["sub", "User ID (UUID)"],
                  ["email", "User's email address"],
                  ["role", 'Always "authenticated" for OAuth tokens'],
                  ["client_id", "The OAuth client that obtained this token"],
                  ["aud", '"authenticated"'],
                  ["exp", "Expiration timestamp"],
                  ["iat", "Issued-at timestamp"],
                  ["session_id", "Session identifier"],
                ].map(([claim, desc]) => (
                  <tr key={claim}>
                    <td className="px-4 py-2.5">
                      <code className="text-xs font-mono font-semibold text-gray-900 dark:text-white">
                        {claim}
                      </code>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">
                      {desc}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Help */}
        <section className="mb-8">
          <div className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 p-6 text-center">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
              Need Help?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              To register a pre-configured OAuth app, request admin-only access,
              or get integration support, reach out to the AI Matrx team.
            </p>
            <a
              href="/contact"
              className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 transition-colors"
            >
              Contact Us
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeading({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      id={id}
      className="text-xl font-bold text-gray-900 dark:text-white mb-4 scroll-mt-20"
    >
      {children}
    </h2>
  );
}

function EndpointTable({
  endpoints,
  highlight,
}: {
  endpoints: { label: string; url: string }[];
  highlight?: "amber";
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-700 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700">
            <th className="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
              Endpoint
            </th>
            <th className="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
              URL
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-neutral-700 bg-white dark:bg-neutral-800/50">
          {endpoints.map((ep) => (
            <tr key={ep.label}>
              <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                {ep.label}
              </td>
              <td className="px-4 py-3">
                <code
                  className={`text-xs font-mono break-all ${highlight === "amber" ? "text-amber-700 dark:text-amber-400" : "text-gray-600 dark:text-gray-400"}`}
                >
                  {ep.url}
                </code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FlowStep({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative pl-10">
      <div className="absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 dark:bg-blue-500 text-white text-xs font-bold">
        {number}
      </div>
      <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden">
      <div className="flex items-center justify-between bg-gray-100 dark:bg-neutral-800 px-3 py-1.5 border-b border-gray-200 dark:border-neutral-700">
        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
          {language}
        </span>
      </div>
      <pre className="overflow-x-auto p-3 bg-gray-50 dark:bg-neutral-900 text-xs leading-relaxed">
        <code className="font-mono text-gray-800 dark:text-gray-300 whitespace-pre">
          {code}
        </code>
      </pre>
    </div>
  );
}

function NoteCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Globe;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 dark:bg-neutral-700">
        <Icon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          {title}
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
          {description}
        </p>
      </div>
    </div>
  );
}
