"use client";

import { useGoogleAPI } from "@/providers/google-provider/GoogleApiProvider";
import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { REGISTERED_GOOGLE_SCOPE_URLS } from "@/lib/googleScopes";

const SCOPE_OPTIONS = [
  {
    id: "webmasters",
    label: "Search Console (read/write)",
    scope: "https://www.googleapis.com/auth/webmasters",
    description: "View and manage Search Console data for your verified sites.",
  },
  {
    id: "webmasters_readonly",
    label: "Search Console (read-only)",
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    description: "Read-only access to Search Console data.",
  },
  {
    id: "calendar_app_created",
    label: "App-created Calendars",
    scope: "https://www.googleapis.com/auth/calendar.app.created",
    description:
      "Create and manage secondary Google Calendars created by this app.",
  },
  {
    id: "drive_file",
    label: "Drive (app files only)",
    scope: "https://www.googleapis.com/auth/drive.file",
    description:
      "Access only Google Drive files created or opened by this app.",
  },
] as const;

const hasClientId = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

export default function GoogleSettingsPage() {
  const {
    signIn,
    signOut,
    isAuthenticated,
    isGoogleLoaded,
    isInitializing,
    error,
    getGrantedScopes,
    token,
  } = useGoogleAPI();

  const [grantedScopes, setGrantedScopes] = useState<string[]>([]);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      setGrantedScopes(getGrantedScopes());
    }
  }, [isAuthenticated, getGrantedScopes]);

  const handleScopeChange = (scope: string, checked: boolean) => {
    setSelectedScopes((prev) =>
      checked ? [...prev, scope] : prev.filter((s) => s !== scope),
    );
  };

  const handleSignIn = async () => {
    setRequestError(null);
    if (selectedScopes.length === 0) {
      setRequestError("Please select at least one permission to grant.");
      return;
    }
    const success = await signIn(selectedScopes);
    if (success) {
      setGrantedScopes(getGrantedScopes());
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setGrantedScopes([]);
    setSelectedScopes([]);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-full bg-gray-50 dark:bg-gray-900 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl mx-auto bg-textured shadow-lg rounded-lg p-8 my-8">
        <h1 className="text-2xl font-bold text-center text-gray-800 dark:text-gray-200 mb-2">
          Connect Your Google Account
        </h1>
        <p className="text-center text-gray-600 dark:text-gray-400 mb-4 text-sm">
          Registered GCP consent-screen scopes only.
        </p>

        {!hasClientId && (
          <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            Set <code className="font-mono">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>{" "}
            in <code className="font-mono">.env.local</code> and restart the dev
            server.
          </div>
        )}

        <div className="bg-muted/50 border border-border rounded-lg p-4 mb-6">
          <h2 className="text-sm font-semibold mb-2">
            All registered scope URLs
          </h2>
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

        <div className="bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-blue-800 dark:text-blue-200 mb-4">
            Select permissions
          </h2>
          <div className="space-y-4">
            {SCOPE_OPTIONS.map(({ id, label, scope, description }) => (
              <div key={id} className="flex items-start space-x-3">
                <Checkbox
                  id={id}
                  onCheckedChange={(checked) =>
                    handleScopeChange(scope, !!checked)
                  }
                  checked={selectedScopes.includes(scope)}
                  className="mt-1"
                />
                <div className="grid gap-1 leading-none min-w-0">
                  <Label
                    htmlFor={id}
                    className="text-base font-medium text-gray-800 dark:text-gray-200"
                  >
                    {label}
                  </Label>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {description}
                  </p>
                  <p className="font-mono text-xs break-all text-muted-foreground">
                    {scope}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {requestError && (
          <p className="text-sm text-center text-red-500 mb-4">
            {requestError}
          </p>
        )}

        <div className="flex items-center justify-center space-x-4 mb-6">
          <button
            type="button"
            onClick={handleSignIn}
            disabled={
              isInitializing ||
              !isGoogleLoaded ||
              isAuthenticated ||
              selectedScopes.length === 0 ||
              !hasClientId
            }
            className="px-6 py-2 text-white font-semibold bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isInitializing ? "Initializing…" : "Connect & grant access"}
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={!isAuthenticated}
            className="px-6 py-2 text-white font-semibold bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-400"
          >
            Disconnect
          </button>
        </div>

        <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">
            Connection status
          </h2>
          <div className="space-y-2 text-sm">
            <p>
              <strong>Status:</strong>{" "}
              {isInitializing ? (
                <span className="text-yellow-600 dark:text-yellow-400">
                  Initializing…
                </span>
              ) : isAuthenticated ? (
                <span className="text-green-600 dark:text-green-400">
                  Connected
                </span>
              ) : (
                <span className="text-red-600 dark:text-red-400">
                  Not connected
                </span>
              )}
            </p>
            {error && (
              <p>
                <strong>Error:</strong>{" "}
                <span className="text-red-500">{error}</span>
              </p>
            )}

            <div className="pt-2">
              <h3 className="font-semibold mb-1">Granted permissions</h3>
              {grantedScopes.length > 0 ? (
                <ul className="list-none space-y-1 bg-textured p-3 rounded-md">
                  {grantedScopes.map((scope) => (
                    <li key={scope} className="font-mono text-xs break-all">
                      {scope}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">
                  {isAuthenticated
                    ? "No permissions granted yet."
                    : "Connect your account to see granted permissions."}
                </p>
              )}
            </div>

            {isAuthenticated && token && (
              <div className="pt-2">
                <h3 className="font-semibold mb-1">Access token (truncated)</h3>
                <p className="text-xs break-all bg-textured p-2 rounded-md font-mono">
                  {token.substring(0, 30)}…
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
