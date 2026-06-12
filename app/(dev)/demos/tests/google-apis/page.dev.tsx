"use client";

import GoogleAccessCard from "@/components/GoogleAccessCard";
import {
  googleServices,
  REGISTERED_GOOGLE_SCOPE_URLS,
} from "@/lib/googleScopes";
import { useGoogleAPI } from "@/providers/google-provider/GoogleApiProvider";
import { useEffect } from "react";

const hasClientId = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

export default function GoogleAccessPage() {
  const {
    isInitializing,
    isAuthenticated,
    isGoogleLoaded,
    error,
    signIn,
    signOut,
    resetError,
    getGrantedScopes,
  } = useGoogleAPI();

  useEffect(() => {
    resetError();
  }, [resetError]);

  return (
    <div className="min-h-dvh w-full bg-gray-50 dark:bg-gray-950 flex flex-col">
      <div className="flex-1 flex flex-col items-center py-12 px-4">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-3 mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 48 48"
              width="40"
              height="40"
              aria-hidden
            >
              <path
                fill="#FFC107"
                d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
              />
              <path
                fill="#FF3D00"
                d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
              />
              <path
                fill="#4CAF50"
                d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
              />
              <path
                fill="#1976D2"
                d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
              />
            </svg>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              Google OAuth — Registered Scopes
            </h1>
          </div>
          <p className="text-muted-foreground max-w-2xl text-center text-sm">
            Only the four scopes registered on the AI Matrx GCP consent screen.
            Authorize each one individually to verify consent-screen alignment.
          </p>
        </div>

        {!hasClientId && (
          <div className="w-full max-w-2xl mb-6 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            <strong>Missing env:</strong> set{" "}
            <code className="font-mono">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> in{" "}
            <code className="font-mono">.env.local</code> (Web client from GCP →
            APIs &amp; Services → Credentials), then restart{" "}
            <code className="font-mono">pnpm dev</code>.
          </div>
        )}

        <div className="w-full max-w-2xl mb-6 bg-card rounded-xl shadow-md p-4 border border-border">
          <h2 className="text-sm font-medium mb-2">Registered scope URLs</h2>
          <ul className="space-y-1">
            {REGISTERED_GOOGLE_SCOPE_URLS.map((scopeUrl) => (
              <li
                key={scopeUrl}
                className="font-mono text-xs break-all text-muted-foreground"
              >
                {scopeUrl}
              </li>
            ))}
          </ul>
        </div>

        <div className="w-full max-w-2xl mb-8 bg-card rounded-xl shadow-md p-6 border border-border">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium mb-1">Google account</h2>
              <p className="text-sm text-muted-foreground">
                {isInitializing
                  ? "Checking authentication status…"
                  : isAuthenticated
                    ? "Signed in — authorize individual scopes below"
                    : "Sign in first, then authorize each scope card"}
              </p>
              {error && (
                <p className="text-sm text-destructive mt-1">{error}</p>
              )}
              {isAuthenticated && getGrantedScopes().length > 0 && (
                <p className="text-xs text-muted-foreground mt-2 font-mono break-all">
                  Granted: {getGrantedScopes().join(" ")}
                </p>
              )}
            </div>
            <div>
              {!isInitializing && (
                <button
                  type="button"
                  onClick={() =>
                    isAuthenticated
                      ? signOut()
                      : signIn([...REGISTERED_GOOGLE_SCOPE_URLS])
                  }
                  disabled={!isGoogleLoaded || !hasClientId}
                  className={`px-4 py-2 rounded-lg text-white font-medium ${
                    !isGoogleLoaded || !hasClientId
                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                      : isAuthenticated
                        ? "bg-gray-600 hover:bg-gray-700"
                        : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  {isAuthenticated ? "Sign out" : "Sign in (all 4 scopes)"}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full">
          {Object.keys(googleServices).map((service) => (
            <GoogleAccessCard
              key={service}
              service={service as keyof typeof googleServices}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
