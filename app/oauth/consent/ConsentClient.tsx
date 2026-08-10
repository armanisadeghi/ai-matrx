"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { extractErrorMessage } from "@/utils/errors";
import { Logo } from "@/components/branding/MatrixLogo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ShieldCheck,
  Mail,
  User,
  Phone,
  ExternalLink,
  AlertTriangle,
  Loader2,
  CheckCircle,
  XCircle,
  ShieldAlert,
} from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OAuthClient {
  id: string;
  name: string;
  uri: string;
  logo_uri: string;
}

interface OAuthAuthorizationDetails {
  authorization_id: string;
  redirect_url?: string;
  client: OAuthClient;
  user: {
    id: string;
    email: string;
  };
  scope: string;
}

interface ScopeDisplayInfo {
  label: string;
  description: string;
  icon: typeof ShieldCheck;
}

interface ErrorDetail {
  code?: string;
  status?: number;
  origin?: string;
}

type PageState =
  | { kind: "loading" }
  | {
      kind: "error";
      title: string;
      message: string;
      retryable: boolean;
      detail?: ErrorDetail;
    }
  | { kind: "redirecting"; message: string; redirectUrl: string }
  | { kind: "consent"; details: OAuthAuthorizationDetails; user: SupabaseUser };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCOPE_DISPLAY: Record<string, ScopeDisplayInfo> = {
  openid: {
    label: "Verify your identity",
    description: "Confirm that you are who you say you are",
    icon: ShieldCheck,
  },
  email: {
    label: "Email address",
    description: "View your email address",
    icon: Mail,
  },
  profile: {
    label: "Profile information",
    description: "View your name and profile picture",
    icon: User,
  },
  phone: {
    label: "Phone number",
    description: "View your phone number",
    icon: Phone,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseScopes(scopeString: string): string[] {
  return scopeString
    .trim()
    .split(/\s+/)
    .filter((s) => s.length > 0);
}

function getInitials(email: string): string {
  const name = email.split("@")[0];
  return name.slice(0, 2).toUpperCase();
}

function getDomain(uri: string): string {
  try {
    return new URL(uri).hostname;
  } catch {
    return uri;
  }
}

/** First-party domains that should never show the "unverified" warning */
const TRUSTED_DOMAINS = ["aimatrx.com", "www.aimatrx.com"];

function isTrustedClient(client: OAuthClient): boolean {
  // Has a logo → registered & verified
  if (client.logo_uri) return true;
  // Check if the client URI belongs to a first-party domain
  try {
    const hostname = new URL(client.uri).hostname;
    return TRUSTED_DOMAINS.some(
      (d) => hostname === d || hostname.endsWith(`.${d}`),
    );
  } catch {
    return false;
  }
}

/** Map Supabase Auth error responses to user-friendly error states */
function mapAuthError(
  error: {
    message?: string;
    status?: number;
    code?: string;
    [key: string]: unknown;
  },
  context: string,
): { title: string; message: string; retryable: boolean; detail: ErrorDetail } {
  const code = (error.code as string) ?? "";
  const msg = (error.message as string) ?? "";
  const status = (error.status as number) ?? 0;
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const detail: ErrorDetail = { code: code || msg, status, origin };

  if (
    msg.includes("unauthorized request origin") ||
    code === "validation_failed"
  ) {
    return {
      title: "Origin not authorized",
      message:
        `This page is being served from "${origin}" but the OAuth server ` +
        "expects a different domain. This is a configuration issue — please " +
        "contact the AI Matrx team.",
      retryable: false,
      detail,
    };
  }

  if (msg.includes("expired") || msg.includes("not found") || status === 404) {
    return {
      title: "Request expired",
      message:
        "This authorization request has expired or was already used. " +
        "Please return to the application and try again.",
      retryable: false,
      detail,
    };
  }

  if (status === 429) {
    return {
      title: "Too many requests",
      message: "Please wait a moment and try again.",
      retryable: true,
      detail,
    };
  }

  return {
    title: `Authorization error (${status || "unknown"})`,
    message:
      `${context}: ${msg || "An unexpected error occurred"}. ` +
      "Please return to the application and try again.",
    retryable: status >= 500,
    detail,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ConsentClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>({ kind: "loading" });
  const [actionLoading, setActionLoading] = useState<"approve" | "deny" | null>(
    null,
  );

  const authorizationId = searchParams.get("authorization_id");

  // -----------------------------------------------------------------------
  // Initialize
  // -----------------------------------------------------------------------
  useEffect(() => {
    async function initialize() {
      console.log("[OAuth Consent] Starting initialization...");
      console.log("[OAuth Consent] authorization_id:", authorizationId);

      if (!authorizationId || typeof authorizationId !== "string") {
        setPageState({
          kind: "error",
          title: "Invalid request",
          message:
            "This authorization request is missing required information. Please return to the application and try again.",
          retryable: false,
        });
        return;
      }

      const supabase = createClient();

      // Step 1: Check auth
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      console.log("[OAuth Consent] User:", user?.email ?? "NOT LOGGED IN");

      if (userError || !user) {
        const currentUrl = window.location.pathname + window.location.search;
        router.push(`/login?redirectTo=${encodeURIComponent(currentUrl)}`);
        return;
      }

      // Step 2: Get authorization details
      console.log(
        "[OAuth Consent] Fetching authorization details, origin:",
        window.location.origin,
      );
      const { data: authData, error: authError } =
        await supabase.auth.oauth.getAuthorizationDetails(authorizationId);

      if (authError) {
        const errObj = authError as unknown as Record<string, unknown>;
        console.error("[OAuth Consent] getAuthorizationDetails FAILED:", {
          message: authError.message,
          status: authError.status,
          code: errObj.code,
          origin: window.location.origin,
          authorization_id: authorizationId,
        });
      }

      if (authError || !authData) {
        const mapped = mapAuthError(
          authError as unknown as Record<string, unknown>,
          "Failed to load authorization details",
        );
        setPageState({ kind: "error", ...mapped });
        return;
      }

      // Step 3: Already consented → redirect immediately (Supabase may return OAuthRedirect)
      const redirectUrl =
        authData && typeof authData === "object" && "redirect_url" in authData
          ? (authData as { redirect_url?: string }).redirect_url
          : undefined;
      if (redirectUrl) {
        setPageState({
          kind: "redirecting",
          message:
            "You have already authorized this application. Redirecting...",
          redirectUrl,
        });
        window.location.href = redirectUrl;
        return;
      }

      // Step 4: Show consent
      setPageState({
        kind: "consent",
        details: authData as OAuthAuthorizationDetails,
        user,
      });
    }

    initialize();
  }, [authorizationId, router]);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------
  async function handleApprove() {
    if (!authorizationId || actionLoading) return;
    setActionLoading("approve");

    try {
      const supabase = createClient();
      const { data, error } =
        await supabase.auth.oauth.approveAuthorization(authorizationId);

      if (error || !data) {
        console.error("[OAuth Consent] approveAuthorization FAILED:", {
          message: error?.message,
          status: error?.status,
          code: (error as unknown as Record<string, unknown>)?.code,
        });
        setActionLoading(null);
        const mapped = mapAuthError(
          (error ?? { message: "No data returned" }) as unknown as Record<
            string,
            unknown
          >,
          "Failed to approve authorization",
        );
        setPageState({ kind: "error", ...mapped, retryable: true });
        return;
      }

      setPageState({
        kind: "redirecting",
        message: "Authorization granted. Redirecting...",
        redirectUrl: data.redirect_url,
      });
      window.location.href = data.redirect_url;
    } catch (err) {
      console.error("[OAuth Consent] approveAuthorization threw:", err);
      setActionLoading(null);
      setPageState({
        kind: "error",
        title: "Network error",
        message:
          "Unable to reach the server. Please check your connection and try again.",
        retryable: true,
        detail: { code: extractErrorMessage(err) },
      });
    }
  }

  async function handleDeny() {
    if (!authorizationId || actionLoading) return;
    setActionLoading("deny");

    try {
      const supabase = createClient();
      const { data, error } =
        await supabase.auth.oauth.denyAuthorization(authorizationId);

      if (error || !data) {
        console.error("[OAuth Consent] denyAuthorization FAILED:", {
          message: error?.message,
          status: error?.status,
          code: (error as unknown as Record<string, unknown>)?.code,
        });
        setActionLoading(null);
        const mapped = mapAuthError(
          (error ?? { message: "No data returned" }) as unknown as Record<
            string,
            unknown
          >,
          "Failed to deny authorization",
        );
        setPageState({ kind: "error", ...mapped, retryable: true });
        return;
      }

      setPageState({
        kind: "redirecting",
        message: "Authorization denied. Redirecting...",
        redirectUrl: data.redirect_url,
      });
      window.location.href = data.redirect_url;
    } catch (err) {
      console.error("[OAuth Consent] denyAuthorization threw:", err);
      setActionLoading(null);
      setPageState({
        kind: "error",
        title: "Network error",
        message:
          "Unable to reach the server. Please check your connection and try again.",
        retryable: true,
        detail: { code: extractErrorMessage(err) },
      });
    }
  }

  function handleRetry() {
    setPageState({ kind: "loading" });
    window.location.reload();
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="min-h-dvh w-full flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* AI Matrx branding */}
        <div className="flex justify-center mb-4">
          <Logo size="lg" variant="horizontal" linkEnabled={false} />
        </div>

        {/* Main card */}
        <div className="bg-card rounded-2xl shadow-lg overflow-hidden border border-border">
          {pageState.kind === "loading" && <LoadingState />}
          {pageState.kind === "error" && (
            <ErrorState
              title={pageState.title}
              message={pageState.message}
              retryable={pageState.retryable}
              detail={pageState.detail}
              onRetry={handleRetry}
            />
          )}
          {pageState.kind === "redirecting" && (
            <RedirectingState
              message={pageState.message}
              redirectUrl={pageState.redirectUrl}
            />
          )}
          {pageState.kind === "consent" && (
            <ConsentForm
              details={pageState.details}
              user={pageState.user}
              actionLoading={actionLoading}
              onApprove={handleApprove}
              onDeny={handleDeny}
            />
          )}
        </div>

        {/* Footer */}
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          AI Matrx keeps your data secure.{" "}
          <a
            href="/privacy-policy"
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <div className="p-6 sm:p-8 space-y-6">
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-xl" />
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="flex items-center gap-3 rounded-lg border border-border px-3.5 py-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-44" />
        </div>
      </div>
      <Skeleton className="h-px w-full" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-48 mb-3" />
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
      <div className="flex gap-3 pt-2">
        <Skeleton className="h-10 flex-1 rounded-md" />
        <Skeleton className="h-10 flex-1 rounded-md" />
      </div>
    </div>
  );
}

function ErrorState({
  title,
  message,
  retryable,
  detail,
  onRetry,
}: {
  title: string;
  message: string;
  retryable: boolean;
  detail?: ErrorDetail;
  onRetry: () => void;
}) {
  return (
    <div className="p-6 sm:p-8 text-center space-y-4">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      {detail && (
        <div className="text-left rounded-lg bg-muted border border-border px-3 py-2.5 mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Debug Info
          </p>
          <div className="space-y-0.5 text-xs font-mono text-muted-foreground">
            {detail.code && <p>Error: {detail.code}</p>}
            {detail.status ? <p>Status: {detail.status}</p> : null}
            {detail.origin && <p>Origin: {detail.origin}</p>}
          </div>
        </div>
      )}
      {retryable && (
        <Button onClick={onRetry} variant="outline" className="mt-2">
          Try again
        </Button>
      )}
    </div>
  );
}

function RedirectingState({
  message,
  redirectUrl,
}: {
  message: string;
  redirectUrl: string;
}) {
  return (
    <div className="p-6 sm:p-8 text-center space-y-4">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold text-foreground">Redirecting</h2>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      <Button asChild variant="outline">
        <a href={redirectUrl}>
          Continue to application
          <ExternalLink className="ml-2 h-4 w-4" />
        </a>
      </Button>
    </div>
  );
}

function ConsentForm({
  details,
  user,
  actionLoading,
  onApprove,
  onDeny,
}: {
  details: OAuthAuthorizationDetails;
  user: SupabaseUser;
  actionLoading: "approve" | "deny" | null;
  onApprove: () => void;
  onDeny: () => void;
}) {
  const scopes = parseScopes(details.scope);
  const clientDomain = getDomain(details.client.uri);
  const userEmail = user.email ?? details.user.email;
  const userAvatar = user.user_metadata?.avatar_url as string | undefined;
  const userName = (user.user_metadata?.full_name ??
    user.user_metadata?.name) as string | undefined;

  const trusted = isTrustedClient(details.client);

  return (
    <div className="p-5 sm:p-8">
      {/* Requesting app header */}
      <div className="text-center space-y-2 mb-4">
        {details.client.logo_uri ? (
          <img
            src={details.client.logo_uri}
            alt={`${details.client.name} logo`}
            className="h-12 w-12 rounded-xl mx-auto object-contain"
          />
        ) : (
          <div className="h-12 w-12 rounded-xl mx-auto bg-muted flex items-center justify-center">
            <ExternalLink className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            {details.client.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            wants to access your AI Matrx account
          </p>
        </div>
      </div>

      {/* Unverified / dynamic client warning — hidden for first-party apps */}
      {!trusted && (
        <div className="flex items-start gap-2.5 mb-4 rounded-lg bg-warning/10 border border-warning/30 px-3 py-2">
          <ShieldAlert className="h-4 w-4 text-warning mt-0.5 shrink-0" />
          <div className="flex flex-col gap-1">
            <p className="text-xs text-warning leading-relaxed">
              This application has not been verified by AI Matrx.
            </p>
            <p className="text-xs text-warning leading-relaxed">
              Only authorize it if you trust{" "}
              <span className="font-semibold">{clientDomain}</span>.
            </p>
          </div>
        </div>
      )}

      {/* Signed-in user identity */}
      <div className="flex items-center gap-3 rounded-lg bg-muted/50 border border-border px-3 py-2.5 mb-1.5">
        <Avatar className="h-8 w-8">
          {userAvatar && (
            <AvatarImage src={userAvatar} alt={userName ?? userEmail} />
          )}
          <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
            {getInitials(userEmail)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          {userName && (
            <p className="text-sm font-medium text-foreground truncate">
              {userName}
            </p>
          )}
          <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
        </div>
      </div>

      {/* Not you? link */}
      <div className="text-right mb-3">
        <a
          href={`/login?redirectTo=${encodeURIComponent(`/oauth/consent?authorization_id=${details.authorization_id}`)}`}
          className="text-xs text-primary hover:underline underline-offset-2"
        >
          Not you? Use a different account
        </a>
      </div>

      {/* Divider */}
      <div className="h-px bg-border mb-3" />

      {/* Scopes / permissions */}
      <div className="mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          This will allow {details.client.name} to:
        </h2>
        <ul className="space-y-1.5">
          {scopes.map((scope) => {
            const info = SCOPE_DISPLAY[scope];
            if (!info) return null;
            const IconComp = info.icon;
            return (
              <li
                key={scope}
                className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <IconComp className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground leading-tight">
                    {info.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {info.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Action buttons — always side by side */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onDeny}
          disabled={actionLoading !== null}
        >
          {actionLoading === "deny" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Denying...
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4" />
              Deny
            </>
          )}
        </Button>
        <Button
          className="flex-1"
          onClick={onApprove}
          disabled={actionLoading !== null}
        >
          {actionLoading === "approve" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Authorizing...
            </>
          ) : (
            <>
              <CheckCircle className="h-4 w-4" />
              Authorize
            </>
          )}
        </Button>
      </div>

      {/* Privacy note */}
      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        Revoke access anytime from{" "}
        <a
          href="/settings"
          className="underline underline-offset-2 hover:text-foreground transition-colors"
        >
          AI Matrx settings
        </a>
      </p>
    </div>
  );
}
