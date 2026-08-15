"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Globe,
  AlertTriangle,
  Check,
  Copy,
  Lock,
  Building2,
} from "lucide-react";
import { getShareableResource } from "@/utils/permissions/registry";
import { publicResourceUrl } from "@/utils/permissions/publicLane";
import type {
  Permission,
  ResourceType,
  ShareActionResult,
} from "@/utils/permissions/types";
import type { VisibilityValue } from "@/utils/permissions/service";
import { PublicBadge } from "../PermissionBadge";
import { useToast } from "@/components/ui/use-toast";
import { ShareLinkPanel } from "../ShareLinkPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errors";
import {
  getShareCapabilities,
  type ShareCapabilities,
} from "@/utils/permissions/shareLinks";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import {
  humanPublicState,
  sharingLocation,
  type PublicAccessView,
  type SharingCopyContext,
} from "@/features/sharing/format";

interface PublicAccessTabProps {
  /** Whether is_public = true on the resource row */
  isPublic: boolean;
  /**
   * The row's canonical `visibility` enum value, or null for a legacy
   * boolean-backed type that genuinely has only two states.
   */
  visibility?: VisibilityValue | null;
  /** Write the canonical enum. Required for the three-state control to render. */
  onSetVisibility?: (next: VisibilityValue) => Promise<ShareActionResult>;
  /** The public permission row from the permissions table, if any */
  publicPermission?: Permission;
  isOwner: boolean;
  onMakePublic: () => Promise<ShareActionResult>;
  onRevokePublic: () => Promise<ShareActionResult>;
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  /**
   * Identity + the page's leading KPIs, mirrored into this tab's payloads so a
   * copied public-state answer is interpretable on its own.
   */
  copy?: SharingCopyContext;
}

/**
 * The three states a person actually chooses between. `link` is a real enum
 * value but it is set by the share-link flow, not picked here — offering it as
 * a fourth button would give one value two owners.
 */
const VISIBILITY_CHOICES: {
  value: VisibilityValue;
  label: string;
  icon: typeof Lock;
  describe: (typeLabel: string) => string;
}[] = [
  {
    value: "personal",
    label: "Only me",
    icon: Lock,
    describe: (t) => `Just you. Nobody else can open this ${t}.`,
  },
  {
    value: "internal",
    label: "My organization",
    icon: Building2,
    describe: (t) => `Anyone in this ${t}'s organization can open and edit it.`,
  },
  {
    value: "public",
    label: "Anyone",
    icon: Globe,
    describe: (t) => `Open to everyone — anyone can view this ${t}, no sign-in.`,
  },
];

/**
 * PublicAccessTab — who can reach this item.
 *
 * TWO SHAPES, because the platform genuinely has two:
 *  • Canonical enum types (`visibility`): a THREE-state picker — Only me /
 *    My organization / Anyone. "My organization" is the state that was
 *    previously unreachable from the UI: the row already carried an
 *    organization_id, but with only a public on/off switch there was no way to
 *    say "share this with my team".
 *  • Legacy boolean types (`is_public`): the original two-state switch,
 *    unchanged. They have no `internal` to move to, so offering one would
 *    promise a team access nobody would actually get.
 *
 * Enum types render the picker INSTEAD of the switch, never both — the switch
 * is a strict subset of the picker, and two controls for one column is how they
 * drift apart.
 */
export function PublicAccessTab({
  isPublic,
  visibility,
  onSetVisibility,
  isOwner,
  onMakePublic,
  onRevokePublic,
  resourceType,
  resourceId,
  resourceName,
  copy,
}: PublicAccessTabProps) {
  const [loading, setLoading] = useState(false);
  const [caps, setCaps] = useState<ShareCapabilities>({
    supportsPublic: false,
    isLinkShareable: false,
    publicState: null,
  });
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(true);
  const [capabilitiesError, setCapabilitiesError] = useState<string | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  /** Human label for the item kind — NEVER render the raw entity token. */
  const typeLabel =
    getShareableResource(resourceType)?.displayLabel?.toLowerCase() ?? "item";
  /** The indexable public page, when this type actually has one. */
  const publicUrl = publicResourceUrl(resourceType, resourceId);

  const copyPublicUrl = useCallback(async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Public link copied" });
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" });
    }
  }, [publicUrl, toast]);

  useEffect(() => {
    let active = true;
    setCapabilitiesLoading(true);
    setCapabilitiesError(null);
    getShareCapabilities(resourceType)
      .then((c) => {
        if (active) setCaps(c);
      })
      .catch((error: unknown) => {
        if (active) setCapabilitiesError(extractErrorMessage(error));
      })
      .finally(() => {
        if (active) setCapabilitiesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [resourceType]);

  const handleToggle = async (checked: boolean) => {
    if (!isOwner) return;
    setLoading(true);
    try {
      const result = checked ? await onMakePublic() : await onRevokePublic();
      if (result?.success !== false) {
        toast({
          title: checked ? "Made public" : "Made private",
          description: checked
            ? "Anyone with the link can now access this resource"
            : "Public access has been removed",
        });
      } else {
        toast({
          title: checked
            ? "Failed to make public"
            : "Failed to remove public access",
          description: result?.error || "Please try again",
          variant: "destructive",
        });
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Please try again";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  /**
   * The three-state control is offered only when all three are true: the
   * physical column really is the canonical enum, the caller wired a writer,
   * and we know the row's current value. Anything less and we fall back to the
   * binary switch rather than render a picker that cannot tell the truth.
   */
  const enumPicker =
    caps.publicState?.kind === "enum" && onSetVisibility && visibility != null;

  const handlePickVisibility = async (next: VisibilityValue) => {
    if (!isOwner || !onSetVisibility || next === visibility) return;
    setLoading(true);
    try {
      const result = await onSetVisibility(next);
      const choice = VISIBILITY_CHOICES.find((c) => c.value === next);
      if (result?.success !== false) {
        toast({
          title: `Visibility set to “${choice?.label ?? next}”`,
          description: choice?.describe(typeLabel),
        });
      } else {
        toast({
          title: "Couldn't change visibility",
          description: result?.error || "Please try again",
          variant: "destructive",
        });
      }
    } catch (error: unknown) {
      toast({
        title: "Couldn't change visibility",
        description: extractErrorMessage(error) || "Please try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  /*
   * THE RENDERED SENTENCES, declared once and used by BOTH the markup below
   * and the payload. This tab's entire job is explaining a reachability state
   * in prose, so the prose IS the data — a payload that paraphrased it would
   * drop the answer the user is reading.
   */
  const UNSUPPORTED_SENTENCE =
    "Public visibility isn’t available for this item type. Use a share link or invite specific people.";
  const heading = isPublic ? "Public — Anyone" : "Public Access";
  const stateSentence = isPublic
    ? publicUrl
      ? "Open to everyone — anyone can view the public page below, no sign-in required"
      : "Marked open to everyone. Use a no-login link above to give someone the actual address."
    : publicUrl
      ? "Turn on to publish a public page anyone can open — no sign-in required"
      : `Turn on to mark this ${typeLabel} open to everyone. It has no public page of its own, so share the address with a no-login link.`;
  const warningSentence = isPublic
    ? `Open to everyone: any signed-in person can view this ${typeLabel}${
        publicUrl
          ? ", and the public page above opens with no sign-in."
          : ". It has no public page of its own — people reach it through a no-login link or from inside the app."
      }`
    : null;
  const privateSentence = isPublic
    ? null
    : `Only you, people you share with, and members of the organizations you share with can open this ${typeLabel}.`;

  const publicView = (): PublicAccessView => ({
    supports_public: caps.supportsPublic,
    is_link_shareable: caps.isLinkShareable,
    is_public: isPublic,
    type_label: typeLabel,
    public_url: publicUrl ?? null,
    heading,
    state_sentence: stateSentence,
    warning_sentence: warningSentence,
    private_sentence: privateSentence,
    unsupported_sentence: caps.supportsPublic ? null : UNSUPPORTED_SENTENCE,
    viewer_can_change: isOwner,
  });

  const context: SharingCopyContext | undefined = copy;
  const location = sharingLocation(context?.surface ?? "Public access");
  const payloadAttributes = {
    ...(context?.kpis ?? {}),
    resource_type: resourceType,
    resource_id: resourceId,
    resource_name: resourceName,
  };

  return (
    <div className="space-y-3">
      {capabilitiesLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : capabilitiesError ? (
        /*
         * ERRORS FIRST. When capabilities fail to load, this tab renders no
         * controls at all — the user sees a red box where the public toggle
         * should be. That sentence is the highest-value thing here.
         */
        <Alert variant="destructive" className="group">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-start gap-2">
            <span className="flex-1">{capabilitiesError}</span>
            <span className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <CopyButtons
                size="xs"
                label="Public access error"
                human={() =>
                  [
                    "Public access controls could not load.",
                    capabilitiesError,
                    `Resource: ${resourceType}:${resourceId} (${resourceName})`,
                    "No public toggle or share-link panel is rendered while this fails.",
                  ].join("\n")
                }
                json={() => ({
                  error: capabilitiesError,
                  resource_type: resourceType,
                  resource_id: resourceId,
                })}
                agent={() => ({
                  kind: "public-access-error",
                  location,
                  description:
                    "The share-capabilities lookup failed, so the Public tab renders no controls. This is the error on screen, verbatim.",
                  data: {
                    rendered_error: capabilitiesError,
                    resource_type: resourceType,
                    resource_id: resourceId,
                    resource_name: resourceName,
                    controls_rendered: false,
                    kpis: context?.kpis ?? null,
                  },
                  attributes: { ...payloadAttributes, state: "error" },
                })}
              />
            </span>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {/* Anyone with the link — no-login token sharing (canonical) */}
          <ShareLinkPanel
            resourceType={resourceType}
            resourceId={resourceId}
            isOwner={isOwner}
            enabled={caps.isLinkShareable}
          />

          {!caps.supportsPublic ? (
            <div className="group p-3 bg-muted/30 rounded-lg border flex items-center gap-2">
              <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <p className="text-xs text-muted-foreground flex-1">
                {UNSUPPORTED_SENTENCE}
              </p>
              {/* A "you can't do this here" state is a blocker the user came to
                  understand — copyable, with the capability flags that caused it. */}
              <span className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <CopyButtons
                  size="xs"
                  label="Public access unavailable"
                  human={() => humanPublicState(publicView())}
                  json={publicView}
                  agent={() => ({
                    kind: "public-access-state",
                    location,
                    description: `This item type does not support public visibility, so the Public tab renders only an explanation. Rendered sentence: "${UNSUPPORTED_SENTENCE}"`,
                    data: { ...publicView(), kpis: context?.kpis ?? null },
                    summary: humanPublicState(publicView()),
                    attributes: {
                      ...payloadAttributes,
                      state: "unsupported",
                      supports_public: false,
                      is_link_shareable: caps.isLinkShareable,
                    },
                  })}
                />
              </span>
            </div>
          ) : enumPicker ? (
            <>
              <div
                className="space-y-1.5 p-3 bg-muted/30 rounded-lg border"
                role="radiogroup"
                aria-label="Who can reach this item"
              >
                <p className="text-xs font-medium">Who can reach this</p>
                <div className="grid gap-1.5">
                  {VISIBILITY_CHOICES.map((choice) => {
                    const Icon = choice.icon;
                    const selected = visibility === choice.value;
                    return (
                      <button
                        key={choice.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={!isOwner || loading}
                        onClick={() => handlePickVisibility(choice.value)}
                        className={cn(
                          "flex w-full items-start gap-2.5 rounded-md border p-2 text-left transition-colors",
                          selected
                            ? "border-primary bg-background"
                            : "border-transparent hover:bg-background/60",
                          (!isOwner || loading) && "opacity-60",
                        )}
                      >
                        <Icon
                          className={cn(
                            "mt-0.5 h-4 w-4 flex-shrink-0",
                            selected ? "text-primary" : "text-muted-foreground",
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-sm font-medium">
                            {choice.label}
                            {selected && (
                              <Check className="h-3.5 w-3.5 text-primary" />
                            )}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {choice.describe(typeLabel)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {!isOwner && (
                  <p className="text-xs text-muted-foreground">
                    Only the owner can change who can reach this {typeLabel}.
                  </p>
                )}
              </div>

              {isPublic && publicUrl && (
                <div className="space-y-1.5 p-3 bg-muted/30 rounded-lg border">
                  <p className="text-xs font-medium">Public page</p>
                  <div className="flex items-center gap-1.5 rounded-md border bg-background p-1.5">
                    <Input
                      readOnly
                      value={publicUrl}
                      className="h-7 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={copyPublicUrl}
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              )}

            </>
          ) : (
            <>
              <div className="group flex items-start justify-between gap-3 p-3 bg-muted/30 rounded-lg border">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {isPublic ? (
                      <>
                        <Globe className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                        <h3 className="text-sm font-medium">{heading}</h3>
                        <PublicBadge variant="compact" />
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <h3 className="text-sm font-medium">{heading}</h3>
                      </>
                    )}
                    <span className="ml-auto opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      <CopyButtons
                        size="xs"
                        label="Public access state"
                        human={() => humanPublicState(publicView())}
                        json={publicView}
                        agent={() => ({
                          kind: "public-access-state",
                          location,
                          description:
                            "Whether this resource is open to everyone, as rendered: the heading, the explanation sentence, the caveat, the public page URL, and what this item type is even capable of.",
                          data: {
                            ...publicView(),
                            kpis: context?.kpis ?? null,
                          },
                          summary: humanPublicState(publicView()),
                          attributes: {
                            ...payloadAttributes,
                            state: isPublic ? "public" : "not-public",
                            has_public_page: Boolean(publicUrl),
                            is_link_shareable: caps.isLinkShareable,
                          },
                        })}
                      />
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {stateSentence}
                  </p>
                </div>

                {isOwner ? (
                  <Switch
                    checked={isPublic}
                    onCheckedChange={handleToggle}
                    disabled={loading}
                    className="flex-shrink-0"
                  />
                ) : isPublic ? (
                  <PublicBadge variant="compact" />
                ) : null}
              </div>

              {isPublic && publicUrl && (
                <div className="space-y-1.5 p-3 bg-muted/30 rounded-lg border">
                  <p className="text-xs font-medium">Public page</p>
                  <div className="flex items-center gap-1.5 rounded-md border bg-background p-1.5">
                    <Input
                      readOnly
                      value={publicUrl}
                      className="h-8 flex-1 text-xs font-mono"
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0"
                      onClick={copyPublicUrl}
                      title="Copy public link"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {isPublic && (
                <Alert className="border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  <AlertDescription className="text-amber-800 dark:text-amber-200 text-xs">
                    <strong>Open to everyone:</strong> any signed-in person can
                    view this {typeLabel}
                    {publicUrl
                      ? ", and the public page above opens with no sign-in."
                      : ". It has no public page of its own — people reach it through a no-login link or from inside the app."}
                    {/* Rendered from the same string the payload carries — see
                        `warningSentence`; the markup only adds the bolding. */}
                  </AlertDescription>
                </Alert>
              )}

              {!isPublic && (
                <div className="p-4 text-center space-y-2 bg-muted/30 rounded-lg border">
                  <Lock className="w-10 h-10 mx-auto text-muted-foreground opacity-20" />
                  <div>
                    <h4 className="text-sm font-medium mb-0.5">
                      Not open to everyone
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {privateSentence}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
