"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, RefreshCw, UsersRound } from "lucide-react";
import { Skeleton } from "@ai-matrx/design-system";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@ai-matrx/design-system";
import { GoogleAccountSelect } from "@/features/google-workspace/GoogleAccountSelect";
import { useGoogleConnectionInventory } from "@/features/marketing/google/hooks";
import { canUseGoogleOAuthInternalTest } from "@/features/marketing/google/internal-test-reviewer";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import { useClippedContentGuard } from "@/lib/layout/useClippedContentGuard";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAdminFeature,
  selectUserEmail,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import {
  googleDirectoryReviewService,
  type DirectoryPreview,
  type DirectoryReviewService,
} from "./service";

import { Spinner } from "@/components/ui/loaders/Spinner";
export interface DirectoryReviewContext {
  organizationId: string;
  actorId: string;
  reviewerEligible: boolean;
  connections: GoogleConnectionSummary[];
}

export function eligibleDirectoryConnections(
  connections: readonly GoogleConnectionSummary[],
  actorId: string,
): GoogleConnectionSummary[] {
  return connections.filter(
    (connection) =>
      connection.owner_type === "user" &&
      connection.owner_user_id === actorId &&
      connection.health === "connected" &&
      connection.scopes.includes(GOOGLE_SCOPE.directoryReadonly),
  );
}

type PreviewSource = Readonly<{
  organizationId: string;
  connectionId: string;
}>;

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Google Directory preview failed.";
}

function literal(value: string | null | undefined): string {
  return value ?? "—";
}

function sourceLabel(source: "DOMAIN_CONTACT" | "DOMAIN_PROFILE"): string {
  return source === "DOMAIN_PROFILE"
    ? "Workspace profile"
    : "Workspace contact";
}

export function DirectoryReviewBody({
  context,
  service = googleDirectoryReviewService,
}: {
  context: DirectoryReviewContext;
  service?: DirectoryReviewService;
}) {
  const fingerprint = JSON.stringify(
    context.connections.map((connection) => [
      connection.id,
      connection.owner_type,
      connection.owner_user_id,
      connection.organization_id,
      connection.provider,
      connection.provider_subject,
      connection.account_email,
      connection.account_name,
      connection.status,
      connection.health,
      connection.credential_present,
      connection.credential_stable,
      connection.scopes,
    ]),
  );
  return (
    <DirectoryReviewBodyInner
      key={`${context.organizationId}:${context.actorId}:${context.reviewerEligible}:${fingerprint}`}
      context={context}
      service={service}
    />
  );
}

function DirectoryReviewBodyInner({
  context,
  service,
}: {
  context: DirectoryReviewContext;
  service: DirectoryReviewService;
}) {
  const eligible = eligibleDirectoryConnections(
    context.connections,
    context.actorId,
  );
  const [connectionId, setConnectionId] = useState("");
  const [preview, setPreview] = useState<DirectoryPreview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [failedSource, setFailedSource] = useState<PreviewSource | null>(null);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  useClippedContentGuard(scrollRef, { label: "Directory people" });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, []);

  const clear = () => {
    generation.current += 1;
    setPreview(null);
    setProblem(null);
    setFailedSource(null);
    setLoading(false);
  };

  const chooseConnection = (nextConnectionId: string) => {
    clear();
    setConnectionId(nextConnectionId);
  };

  const load = async (retrySource: PreviewSource | null = null) => {
    if (loading || !context.reviewerEligible) return;
    const source =
      retrySource ??
      (connectionId
        ? Object.freeze({
            organizationId: context.organizationId,
            connectionId,
          })
        : null);
    if (!source) return;
    if (
      !eligible.some((connection) => connection.id === source.connectionId)
    ) {
      clear();
      setProblem("That Google account is no longer eligible for Directory review.");
      return;
    }
    const intent = ++generation.current;
    setPreview(null);
    setProblem(null);
    setFailedSource(null);
    setLoading(true);
    try {
      const result = await service.preview(
        { connection_id: source.connectionId },
        source.organizationId,
      );
      if (!mounted.current || generation.current !== intent) return;
      setPreview(result);
    } catch (error) {
      if (!mounted.current || generation.current !== intent) return;
      setFailedSource(source);
      setProblem(errorMessage(error));
    } finally {
      if (mounted.current && generation.current === intent) setLoading(false);
    }
  };

  if (!context.reviewerEligible) return null;

  if (eligible.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-sm space-y-2 text-center">
          <UsersRound className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Directory preview unavailable</p>
          <p className="type-body text-muted-foreground">
            No personal Google account has Directory access.
          </p>
        </div>
      </div>
    );
  }

  const people = preview?.people ?? [];
  const isError = problem !== null;
  const unavailable = preview?.status === "workspace_directory_unavailable";
  const moreAvailable =
    preview?.status === "next_page_available" ||
    preview?.next_page_available === true;

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-end">
        <GoogleAccountSelect
          connections={eligible}
          connectionId={connectionId}
          onConnectionChange={chooseConnection}
          requireExplicitSelection
          disabled={loading}
          className="min-w-0 flex-1"
        />
        <Button
          icon={loading ? (
            <Spinner size="xs" className="text-current" />
          ) : (
            <UsersRound />
          )}
          variant="primary"
          className="shrink-0"
          disabled={!connectionId || loading}
          onClick={() => void load()}
        >
          Preview directory
        </Button>
      </div>

      {isError ? (
        <ErrorNotice
          size="compact"
          title="Preview failed"
          message={problem}
          operation="Preview Google Directory people"
          actions={
            failedSource ? (
              <Button
                icon={<RefreshCw />}
                variant="outline"
                onClick={() => void load(failedSource)}
              >
                Try again
              </Button>
            ) : null
          }
        />
      ) : unavailable ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border bg-muted/20 p-6 text-center">
          <div className="max-w-sm space-y-2">
            <Building2 className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Workspace Directory unavailable</p>
            <p className="type-body text-muted-foreground">
              This Google account has no readable Workspace Directory.
            </p>
            <p className="type-secondary text-muted-foreground">
              Account: {preview.account_label}
            </p>
          </div>
        </div>
      ) : preview ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 type-secondary text-muted-foreground">
            <span className="font-medium text-foreground">
              {people.length} {people.length === 1 ? "person" : "people"}
            </span>
            <span>Account: {preview.account_label}</span>
            <Badge variant="outline">First 50</Badge>
            {moreAvailable ? (
              <Badge variant="secondary">More people available</Badge>
            ) : null}
          </div>
          {people.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-6 type-body text-muted-foreground">
              No Directory people were returned.
            </div>
          ) : (
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[960px] text-left type-body">
                <thead className="sticky top-0 z-10 bg-muted/95 type-secondary text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Title</th>
                    <th className="px-3 py-2 font-medium">Department</th>
                    <th className="px-3 py-2 font-medium">Manager</th>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">Account</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {people.map((person) => (
                    <tr key={person.resource_name} className="align-top">
                      <td className="px-3 py-2 font-medium">
                        {literal(person.display_name)}
                      </td>
                      <td className="px-3 py-2">
                        {person.emails?.length
                          ? person.emails.join(", ")
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {literal(person.organization_title)}
                      </td>
                      <td className="px-3 py-2">
                        {literal(person.organization_department)}
                      </td>
                      <td className="px-3 py-2">
                        {literal(person.manager)}
                      </td>
                      <td className="px-3 py-2">
                        {person.source_types.length
                          ? person.source_types.map(sourceLabel).join(", ")
                          : "—"}
                      </td>
                      <td className="px-3 py-2">{person.account_label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function DirectoryReview({
  organizationId,
}: {
  organizationId: string | null;
}) {
  const actorId = useAppSelector(selectUserId);
  const isSuperAdmin = useAppSelector((s) =>
    selectAdminFeature(s, "google.internal-review"),
  );
  const email = useAppSelector(selectUserEmail);
  const reviewerEligible = canUseGoogleOAuthInternalTest(isSuperAdmin, email);
  const inventory = useGoogleConnectionInventory();

  if (!reviewerEligible) return null;
  if (!organizationId) {
    return (
      <div className="flex h-full items-center justify-center p-6 type-body text-muted-foreground">
        Choose an organization to review Directory people.
      </div>
    );
  }
  if (!actorId || inventory.isLoading) {
    return (
      <div className="space-y-3 p-3">
        <Skeleton shape="block" height="md" />
        <Skeleton shape="block" height="lg" />
      </div>
    );
  }
  if (inventory.isError) {
    return (
      <div className="p-3">
        <ErrorNotice
          title="Accounts unavailable"
          message="We could not load Google accounts for Directory review."
          operation="Load Google accounts"
          actions={
            <Button
              variant="outline"
              onClick={() => void inventory.refetch()}
            >
              Try again
            </Button>
          }
        />
      </div>
    );
  }
  return (
    <DirectoryReviewBody
      context={{
        organizationId,
        actorId,
        reviewerEligible,
        connections: inventory.data?.connections ?? [],
      }}
    />
  );
}
