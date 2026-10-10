"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@ai-matrx/design-system";
import { GoogleAccountSelect } from "@/features/google-workspace/GoogleAccountSelect";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import {
  googleBusinessProfileReviewService,
  type BusinessProfileAccountsPreview,
  type BusinessProfileLocationsPreview,
  type BusinessProfileReviewsPreview,
  type BusinessProfileReviewService,
} from "./service";

export interface BusinessProfileReviewContext {
  organizationId: string;
  actorId: string;
  connections: GoogleConnectionSummary[];
}

export function eligibleBusinessProfileConnections(
  connections: readonly GoogleConnectionSummary[],
  actorId: string,
): GoogleConnectionSummary[] {
  return connections.filter(
    (connection) =>
      connection.owner_type === "user" &&
      connection.owner_user_id === actorId &&
      connection.health === "connected" &&
      connection.scopes.includes(GOOGLE_SCOPE.businessManage),
  );
}

type AccountSource = Readonly<{
  organizationId: string;
  connectionId: string;
  pageToken: string | null;
}>;
type LocationSource = Readonly<{
  organizationId: string;
  connectionId: string;
  accountName: string;
  pageToken: string | null;
}>;
type ReviewSource = Readonly<{
  organizationId: string;
  connectionId: string;
  accountName: string;
  locationName: string;
  pageToken: string | null;
}>;
type Busy = "accounts" | "locations" | "reviews" | null;

function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Business Profile preview failed.";
}

/** Transient, read-only Business Profile reviewer with request-bound page lineage. */
export function BusinessProfileReviewBody({
  context,
  service = googleBusinessProfileReviewService,
}: {
  context: BusinessProfileReviewContext;
  service?: BusinessProfileReviewService;
}) {
  const identity = JSON.stringify(
    context.connections.map((connection) => [
      connection.id,
      connection.owner_type,
      connection.owner_user_id,
      connection.health,
      connection.scopes,
    ]),
  );
  return (
    <BusinessProfileReviewBodyInner
      key={`${context.organizationId}:${context.actorId}:${identity}`}
      context={context}
      service={service}
    />
  );
}

function BusinessProfileReviewBodyInner({
  context,
  service,
}: {
  context: BusinessProfileReviewContext;
  service: BusinessProfileReviewService;
}) {
  const eligible = eligibleBusinessProfileConnections(
    context.connections,
    context.actorId,
  );
  const [connectionId, setConnectionId] = useState("");
  const [accounts, setAccounts] =
    useState<BusinessProfileAccountsPreview | null>(null);
  const [locations, setLocations] =
    useState<BusinessProfileLocationsPreview | null>(null);
  const [reviews, setReviews] = useState<BusinessProfileReviewsPreview | null>(
    null,
  );
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [failed, setFailed] = useState<
    AccountSource | LocationSource | ReviewSource | null
  >(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const seen = useRef({
    accounts: new Set<string>(),
    locations: new Set<string>(),
    reviews: new Set<string>(),
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, []);
  const reset = () => {
    generation.current += 1;
    setAccounts(null);
    setLocations(null);
    setReviews(null);
    setSelectedAccount(null);
    setSelectedLocation(null);
    setFailed(null);
    setProblem(null);
    setBusy(null);
    seen.current.accounts.clear();
    seen.current.locations.clear();
    seen.current.reviews.clear();
  };
  const allowed = (connection: string) =>
    eligible.some((item) => item.id === connection);
  const start = (kind: Busy) => {
    const intent = ++generation.current;
    setBusy(kind);
    setProblem(null);
    setFailed(null);
    return intent;
  };
  const settle = (intent: number) =>
    mounted.current && generation.current === intent;

  const loadAccounts = async (
    pageToken: string | null = null,
    frozen?: AccountSource,
  ) => {
    const source: AccountSource = frozen
      ? { ...frozen, pageToken }
      : { organizationId: context.organizationId, connectionId, pageToken };
    if (!source.connectionId || !allowed(source.connectionId)) {
      setProblem(
        "Choose a connected personal Google account with Business Profile access.",
      );
      return;
    }
    if (pageToken && seen.current.accounts.has(pageToken)) {
      setProblem(
        "This account page was already shown; the provider repeated its page token.",
      );
      return;
    }
    if (!pageToken) seen.current.accounts.clear();
    setAccounts(null);
    setLocations(null);
    setReviews(null);
    setSelectedAccount(null);
    setSelectedLocation(null);
    const intent = start("accounts");
    try {
      const page = await service.previewAccounts(
        { connection_id: source.connectionId, page_token: source.pageToken },
        source.organizationId,
      );
      if (!settle(intent)) return;
      if (pageToken) seen.current.accounts.add(pageToken);
      setAccounts(page);
    } catch (error) {
      if (settle(intent)) {
        setFailed(source);
        setProblem(errorText(error));
      }
    } finally {
      if (settle(intent)) setBusy(null);
    }
  };
  const loadLocations = async (
    accountName: string,
    pageToken: string | null = null,
    frozen?: LocationSource,
  ) => {
    const source: LocationSource = frozen
      ? { ...frozen, pageToken }
      : {
          organizationId: context.organizationId,
          connectionId,
          accountName,
          pageToken,
        };
    if (!allowed(source.connectionId)) {
      reset();
      setProblem(
        "That Google account is no longer eligible for Business Profile review.",
      );
      return;
    }
    if (pageToken && seen.current.locations.has(pageToken)) {
      setProblem(
        "This location page was already shown; the provider repeated its page token.",
      );
      return;
    }
    if (!pageToken) seen.current.locations.clear();
    setSelectedAccount(source.accountName);
    setLocations(null);
    setReviews(null);
    setSelectedLocation(null);
    const intent = start("locations");
    try {
      const page = await service.previewLocations(
        {
          connection_id: source.connectionId,
          account_name: source.accountName,
          page_token: source.pageToken,
        },
        source.organizationId,
      );
      if (!settle(intent)) return;
      if (pageToken) seen.current.locations.add(pageToken);
      setLocations(page);
    } catch (error) {
      if (settle(intent)) {
        setFailed(source);
        setProblem(errorText(error));
      }
    } finally {
      if (settle(intent)) setBusy(null);
    }
  };
  const loadReviews = async (
    locationName: string,
    pageToken: string | null = null,
    frozen?: ReviewSource,
  ) => {
    if (!selectedAccount && !frozen) return;
    const accountName = selectedAccount;
    if (!accountName && !frozen) return;
    const source: ReviewSource = frozen
      ? { ...frozen, pageToken }
      : {
          organizationId: context.organizationId,
          connectionId,
          accountName: accountName ?? "",
          locationName,
          pageToken,
        };
    if (!allowed(source.connectionId)) {
      reset();
      setProblem(
        "That Google account is no longer eligible for Business Profile review.",
      );
      return;
    }
    if (pageToken && seen.current.reviews.has(pageToken)) {
      setProblem(
        "This review page was already shown; the provider repeated its page token.",
      );
      return;
    }
    if (!pageToken) seen.current.reviews.clear();
    setSelectedLocation(source.locationName);
    setReviews(null);
    const intent = start("reviews");
    try {
      const page = await service.previewReviews(
        {
          connection_id: source.connectionId,
          account_name: source.accountName,
          location_name: source.locationName,
          page_token: source.pageToken,
        },
        source.organizationId,
      );
      if (!settle(intent)) return;
      if (pageToken) seen.current.reviews.add(pageToken);
      setReviews(page);
    } catch (error) {
      if (settle(intent)) {
        setFailed(source);
        setProblem(errorText(error));
      }
    } finally {
      if (settle(intent)) setBusy(null);
    }
  };
  const retry = () => {
    if (!failed) return;
    if ("locationName" in failed)
      void loadReviews(failed.locationName, failed.pageToken, failed);
    else if ("accountName" in failed)
      void loadLocations(failed.accountName, failed.pageToken, failed);
    else void loadAccounts(failed.pageToken, failed);
  };

  return (
    <section
      aria-label="Business Profile reviewer"
      className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="type-title text-foreground">Business Profile reviews</h2>
        <span className="type-secondary text-muted-foreground">Read only</span>
        <a
          className="mt-2 inline-block type-body text-primary hover:underline"
          href="https://business.google.com/locations"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open Google Business Profile
        </a>
      </div>
      <GoogleAccountSelect
        connections={eligible}
        connectionId={connectionId}
        onConnectionChange={(id) => {
          reset();
          setConnectionId(id);
        }}
        label="Google account with Business Profile access"
        disabled={busy !== null}
        requireExplicitSelection
      />
      {eligible.length === 0 ? (
        <p className="rounded-md border border-border p-3 type-body text-muted-foreground">
          No connected personal account has Business Profile access.
        </p>
      ) : null}
      <Button
        type="button"
        variant="primary"
        disabled={busy !== null || !connectionId}
        onClick={() => void loadAccounts()}
      >
        {busy === "accounts" ? "Loading accounts…" : "View accounts"}
      </Button>
      {problem ? <ErrorNotice error={problem} /> : null}
      {failed ? (
        <Button
          type="button"
          variant="outline"
          disabled={busy !== null}
          onClick={retry}
        >
          Retry this page
        </Button>
      ) : null}
      {accounts ? (
        <Page
          title={`Accounts from ${accounts.account_label}`}
          state={accounts.state}
          next={() =>
            void loadAccounts(accounts.next_page_token ?? null, {
              organizationId: context.organizationId,
              connectionId,
              pageToken: accounts.next_page_token ?? null,
            })
          }
          nextToken={accounts.next_page_token}
        >
          {accounts.accounts.length ? (
            accounts.accounts.map((account) => (
              <Button
                key={account.name}
                type="button"
                variant="outline"
                className="block h-auto w-full p-3 text-left"
                disabled={busy !== null}
                onClick={() => void loadLocations(account.name)}
              >
                <span className="block font-medium">
                  {account.accountName ?? account.name}
                </span>
                <span className="block type-secondary text-muted-foreground">
                  Source: {account.name}
                </span>
              </Button>
            ))
          ) : (
            // read-gate-exempt: shown only for a preview that already returned
            <Empty label="No accounts were returned for this page." />
          )}
        </Page>
      ) : null}
      {locations && selectedAccount ? (
        <Page
          title={`Locations from ${locations.account_label}`}
          state={locations.state}
          next={() =>
            void loadLocations(
              selectedAccount,
              locations.next_page_token ?? null,
              {
                organizationId: context.organizationId,
                connectionId,
                accountName: selectedAccount,
                pageToken: locations.next_page_token ?? null,
              },
            )
          }
          nextToken={locations.next_page_token}
        >
          {locations.locations.length ? (
            locations.locations.map((location) => (
              <div key={location.name} className="flex items-stretch gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="block h-auto min-w-0 flex-1 p-3 text-left"
                  disabled={busy !== null}
                  onClick={() => void loadReviews(location.name)}
                >
                  <span className="block font-medium">
                    {location.title ?? location.name}
                  </span>
                  <span className="block type-secondary text-muted-foreground">
                    Source: {location.name}
                  </span>
                </Button>
                {location.metadata?.mapsUri ? (
                  <a
                    href={location.metadata.mapsUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${location.title ?? location.name} in Google Maps`}
                    className="inline-flex shrink-0 items-center justify-center rounded-md border border-border px-3 text-muted-foreground hover:border-primary/50 hover:text-primary"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : null}
              </div>
            ))
          ) : (
            // read-gate-exempt: shown only for a preview that already returned
            <Empty label="No locations were returned for this page." />
          )}
        </Page>
      ) : null}
      {reviews && selectedAccount && selectedLocation ? (
        <Page
          title={`Reviews from ${reviews.account_label}`}
          state={reviews.state}
          next={() =>
            void loadReviews(
              selectedLocation,
              reviews.next_page_token ?? null,
              {
                organizationId: context.organizationId,
                connectionId,
                accountName: selectedAccount,
                locationName: selectedLocation,
                pageToken: reviews.next_page_token ?? null,
              },
            )
          }
          nextToken={reviews.next_page_token}
        >
          {reviews.reviews.length ? (
            reviews.reviews.map((review) => (
              <article
                key={review.reviewId}
                className="rounded-md border border-border p-3 type-body"
              >
                <p className="font-medium">
                  {review.starRating ?? "Rating unavailable"} ·{" "}
                  {review.reviewer?.displayName ??
                    (review.reviewer?.isAnonymous
                      ? "Anonymous reviewer"
                      : "Reviewer unavailable")}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words">
                  {review.comment ?? "No comment"}
                </p>
                <p className="mt-1 type-secondary text-muted-foreground">
                  {review.createTime ?? review.updateTime ?? "Date unavailable"}
                </p>
                {review.reviewReply ? (
                  <div className="mt-2 border-l-2 border-border pl-3">
                    <p className="font-medium">Business reply</p>
                    <p className="whitespace-pre-wrap break-words">
                      {review.reviewReply.comment}
                    </p>
                    <p className="type-secondary text-muted-foreground">
                      {review.reviewReply.updateTime ??
                        "Reply date unavailable"}
                    </p>
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            // read-gate-exempt: shown only for a preview that already returned
            <Empty label="No reviews were returned for this page." />
          )}
        </Page>
      ) : null}
    </section>
  );
}
function Empty({ label }: { label: string }) {
  return <p className="type-body text-muted-foreground">{label}</p>;
}
function Page({
  title,
  state,
  nextToken,
  next,
  children,
}: {
  title: string;
  state: "incomplete" | "terminal";
  nextToken?: string | null;
  next: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="type-title">{title}</p>
        <span className="type-secondary text-muted-foreground">
          {state === "incomplete" ? "More results available" : "End of results"}
        </span>
      </div>
      {children}
      {nextToken ? (
        <Button type="button" variant="outline" onClick={next}>
          Next page
        </Button>
      ) : null}
    </div>
  );
}
