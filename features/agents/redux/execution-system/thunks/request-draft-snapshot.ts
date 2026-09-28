/**
 * Request draft snapshot — a composer's COMPLETE request as plain JSON, and
 * the thunk that puts it back.
 *
 * `copyInstanceRequestDraft` moves a request between two live instances; this
 * is the same field list made durable, so a surface can save a request and
 * restore an identical one later (a saved battle, a saved invocation). What is
 * captured is exactly what the composer would send: text, message parts,
 * variables (with their resource policies), attachments, context entries, run
 * settings and the person's model changes.
 *
 * Never captured, by design: the server-override URL and auth token (a
 * credential), client tools (functions owned by the mounted surface), the
 * assembled `finalPayload` (rebuilt from the source at send time) and resource
 * lifecycle status.
 *
 * An attachment that cannot be restored identically is never saved silently:
 * a still-uploading or failed attachment, a `blob:` URL, or a temporary signed
 * link comes back in `omitted` with the reason, so the caller can say so.
 * Stored files are saved by their permanent file id.
 */

import type { AppThunk, RootState } from "@/lib/redux/store";
import { isSignedUrl } from "@/lib/media/signed-url";
import type {
  BuilderAdvancedSettings,
  InstanceContextEntry,
  ResourceBlockType,
  ResourceOptions,
} from "@/features/agents/types/instance.types";
import type { MessagePart } from "@/types/python-generated/stream-events";
import {
  setUserInputMessageParts,
  setUserInputText,
} from "../instance-user-input/instance-user-input.slice";
import {
  clearSubmittedVariableResourcePolicies,
  resetUserVariableValues,
  setRuntimeVariableResourcePolicy,
  setScopeVariableValues,
  setUserVariableValues,
} from "../instance-variable-values/instance-variable-values.slice";
import {
  addResource,
  clearAllResources,
  reorderResources,
  setResourceEditedContent,
  setResourcePreview,
  setResourceStatus,
} from "../instance-resources/instance-resources.slice";
import {
  clearInstanceContext,
  setContextEntries,
} from "../instance-context/instance-context.slice";
import { setBuilderAdvancedSettings } from "../instance-ui-state/instance-ui-state.slice";
import { replaceOverrides } from "../instance-model-overrides/instance-model-overrides.slice";

export const REQUEST_DRAFT_SNAPSHOT_VERSION = 1 as const;

export interface RequestDraftResourceSnapshot {
  resourceId: string;
  blockType: ResourceBlockType;
  source: unknown;
  preview: unknown | null;
  options: ResourceOptions;
  /** Present only when the person edited the resolved content. */
  editedContent?: unknown;
}

export interface RequestDraftSnapshot {
  v: typeof REQUEST_DRAFT_SNAPSHOT_VERSION;
  text: string;
  messageParts: MessagePart[] | null;
  userValues: Record<string, unknown>;
  scopeValues: Record<string, unknown>;
  resourcePolicies: Record<string, unknown>;
  resources: RequestDraftResourceSnapshot[];
  context: InstanceContextEntry[];
  runSettings: BuilderAdvancedSettings | null;
  /** The person's model changes; a removed key is `null`. */
  modelChanges: Record<string, unknown>;
}

export interface OmittedAttachment {
  label: string;
  reason: string;
}

export interface CapturedRequestDraft {
  snapshot: RequestDraftSnapshot;
  omitted: OmittedAttachment[];
}

/** JSON round-trip: the snapshot is stored as jsonb and must survive it. */
function plain<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function urlsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  const out: string[] = [];
  for (const key of ["url", "uri", "src", "href"]) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === "string") out.push(v);
  }
  return out;
}

function hasFileId(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (typeof v.file_id === "string" && v.file_id.length > 0) ||
    (typeof v.fileId === "string" && v.fileId.length > 0)
  );
}

/** Why this attachment cannot be restored identically, or null when it can. */
export function attachmentDurabilityProblem(resource: {
  status: string;
  source: unknown;
}): string | null {
  if (resource.status === "error") return "it failed to attach";
  if (hasFileId(resource.source)) return null;
  for (const url of urlsIn(resource.source)) {
    if (url.startsWith("blob:")) return "it was still uploading";
    if (isSignedUrl(url)) return "it is a temporary link that expires";
  }
  return null;
}

function attachmentLabel(preview: unknown, blockType: string): string {
  if (preview && typeof preview === "object") {
    const p = preview as Record<string, unknown>;
    for (const key of ["label", "title", "filename", "name"]) {
      if (typeof p[key] === "string" && p[key]) return p[key] as string;
    }
  }
  if (typeof preview === "string" && preview && !preview.startsWith("blob:")) {
    return preview.length > 60 ? `${preview.slice(0, 57)}...` : preview;
  }
  return blockType.replace(/^input_/, "").replace(/_/g, " ");
}

function durablePreview(preview: unknown): unknown | null {
  if (typeof preview === "string" && preview.startsWith("blob:")) return null;
  return preview ?? null;
}

export function captureRequestDraft(
  state: RootState,
  conversationId: string,
): CapturedRequestDraft {
  const input = state.instanceUserInput.byConversationId[conversationId];
  const variables =
    state.instanceVariableValues.byConversationId[conversationId];
  const resources =
    state.instanceResources.byConversationId[conversationId] ?? {};
  const context = state.instanceContext.byConversationId[conversationId] ?? {};
  const ui = state.instanceUIState.byConversationId[conversationId];
  const overrides =
    state.instanceModelOverrides.byConversationId[conversationId];

  const omitted: OmittedAttachment[] = [];
  const savedResources: RequestDraftResourceSnapshot[] = [];
  for (const resource of Object.values(resources).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )) {
    const problem = attachmentDurabilityProblem(resource);
    if (problem) {
      omitted.push({
        label: attachmentLabel(resource.preview, resource.blockType),
        reason: problem,
      });
      continue;
    }
    savedResources.push({
      resourceId: resource.resourceId,
      blockType: resource.blockType,
      source: plain(resource.source),
      preview: plain(durablePreview(resource.preview)),
      options: plain(resource.options),
      ...(resource.userEdited
        ? { editedContent: plain(resource.editedContent) }
        : {}),
    });
  }

  return {
    snapshot: {
      v: REQUEST_DRAFT_SNAPSHOT_VERSION,
      text: input?.text ?? "",
      messageParts: plain(input?.messageParts ?? null),
      userValues: plain(variables?.userValues ?? {}),
      scopeValues: plain(variables?.scopeValues ?? {}),
      resourcePolicies: plain(variables?.resourcePolicies ?? {}),
      resources: savedResources,
      context: plain(Object.values(context)),
      runSettings: plain(ui?.builderAdvancedSettings ?? null),
      modelChanges: overrides
        ? plain({
            ...overrides.overrides,
            ...Object.fromEntries(overrides.removals.map((k) => [k, null])),
          })
        : {},
    },
    omitted,
  };
}

/** A stored value that is a request snapshot this build can restore. */
export function isRequestDraftSnapshot(
  value: unknown,
): value is RequestDraftSnapshot {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { v?: unknown }).v === REQUEST_DRAFT_SNAPSHOT_VERSION &&
    Array.isArray((value as { resources?: unknown }).resources)
  );
}

/**
 * Replace the target composer's request with the snapshot. The target keeps
 * its own agent, base model snapshot, surface context owners and client tools.
 */
export function applyRequestDraft({
  snapshot,
  conversationId,
}: {
  snapshot: RequestDraftSnapshot;
  conversationId: string;
}): AppThunk {
  return (dispatch, getState) => {
    dispatch(
      setUserInputText({
        conversationId,
        text: snapshot.text,
        userValues: snapshot.userValues,
      }),
    );
    dispatch(
      setUserInputMessageParts({
        conversationId,
        parts: snapshot.messageParts ? [...snapshot.messageParts] : null,
      }),
    );

    dispatch(resetUserVariableValues(conversationId));
    dispatch(
      setUserVariableValues({ conversationId, values: snapshot.userValues }),
    );
    dispatch(
      setScopeVariableValues({ conversationId, values: snapshot.scopeValues }),
    );
    const currentPolicies =
      getState().instanceVariableValues.byConversationId[conversationId]
        ?.resourcePolicies ?? {};
    dispatch(
      clearSubmittedVariableResourcePolicies({
        conversationId,
        submitted: { ...currentPolicies },
      }),
    );
    for (const [name, policy] of Object.entries(snapshot.resourcePolicies)) {
      dispatch(
        setRuntimeVariableResourcePolicy({
          conversationId,
          name,
          policy: policy as Parameters<
            typeof setRuntimeVariableResourcePolicy
          >[0]["policy"],
        }),
      );
    }

    dispatch(clearAllResources(conversationId));
    for (const resource of snapshot.resources) {
      dispatch(
        addResource({
          conversationId,
          blockType: resource.blockType,
          source: resource.source,
          options: resource.options,
          resourceId: resource.resourceId,
        }),
      );
      if (resource.preview !== null) {
        dispatch(
          setResourcePreview({
            conversationId,
            resourceId: resource.resourceId,
            preview: resource.preview,
          }),
        );
      }
      if ("editedContent" in resource) {
        dispatch(
          setResourceEditedContent({
            conversationId,
            resourceId: resource.resourceId,
            content: resource.editedContent,
          }),
        );
      }
      // Only attachments that were usable are saved, and each is restored by
      // its durable identity, so it is sendable as soon as it is back.
      dispatch(
        setResourceStatus({
          conversationId,
          resourceId: resource.resourceId,
          status: "ready",
        }),
      );
    }
    dispatch(
      reorderResources({
        conversationId,
        orderedIds: snapshot.resources.map((r) => r.resourceId),
      }),
    );

    dispatch(clearInstanceContext(conversationId));
    dispatch(
      setContextEntries({
        conversationId,
        entries: snapshot.context.map((entry) => ({ ...entry })),
      }),
    );

    if (snapshot.runSettings) {
      dispatch(
        setBuilderAdvancedSettings({
          conversationId,
          changes: snapshot.runSettings,
        }),
      );
    }
    if (Object.keys(snapshot.modelChanges).length > 0) {
      dispatch(
        replaceOverrides({ conversationId, changes: snapshot.modelChanges }),
      );
    }
  };
}
