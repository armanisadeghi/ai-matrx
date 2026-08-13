"use client";

/**
 * Canonical references for the two FK identities most often rendered as
 * meaningless UUIDs: AI models and tools.
 *
 * Both components resolve a durable display name from the existing Redux
 * catalogues, fall back loudly when a row is missing, preserve the raw ID as
 * optional audit text, and delegate all navigation behavior to `EntityRef`.
 */

import { useEffect, useMemo } from "react";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { isUuidValue } from "@/components/official/entity-ref/doors";
import { aiModelHref } from "@/features/ai-models/doors";
import {
  fetchModelIdentityById,
  makeSelectModelById,
  selectModelIdentityById,
  selectModelIdentityLookupStatus,
} from "@/features/ai-models/redux/modelRegistrySlice";
import { toolHref } from "@/features/tool-registry/doors";
import { fetchToolById } from "@/features/agents/redux/tools/tools.thunks";
import {
  makeSelectToolById,
  selectToolLookupStatus,
} from "@/features/agents/redux/tools/tools.selectors";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { formatText } from "@/utils/text/text-case-converter";
import { cn } from "@/lib/utils";

interface AiIdentityRefCommonProps {
  /** Explicit joined label wins and avoids even a cached lookup. */
  name?: string | null;
  /** Audit/history mode: render the complete raw FK directly below the name. */
  showId?: boolean;
  showIcon?: boolean;
  alwaysShowActions?: boolean;
  openInNewTab?: boolean;
  /** For identity text nested inside another interactive control. */
  disableNavigation?: boolean;
  className?: string;
  labelClassName?: string;
}

interface IdentityLabelProps {
  id: string;
  name: string;
  showId: boolean;
}

function IdentityLabel({ id, name, showId }: IdentityLabelProps) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0",
        showId ? "flex-col" : "items-baseline gap-1",
      )}
    >
      <span className="min-w-0 truncate font-medium">{name}</span>
      {showId ? (
        <span className="select-all break-all font-mono text-[0.625rem] font-normal text-muted-foreground">
          {id}
        </span>
      ) : null}
    </span>
  );
}

function fallbackName(kind: "AI model" | "tool", id: string): string {
  return isUuidValue(id) ? `Unknown ${kind}` : formatText(id);
}

export interface AiModelRefProps extends AiIdentityRefCommonProps {
  modelId: string;
}

export function AiModelRef({
  modelId,
  name,
  showId = false,
  showIcon = true,
  alwaysShowActions,
  openInNewTab = true,
  disableNavigation = false,
  className,
  labelClassName,
}: AiModelRefProps) {
  const dispatch = useAppDispatch();
  const selectModel = useMemo(() => makeSelectModelById(), []);
  const model = useAppSelector((state) => selectModel(state, modelId));
  const historicalIdentity = useAppSelector((state) =>
    selectModelIdentityById(state, modelId),
  );
  const lookupStatus = useAppSelector((state) =>
    selectModelIdentityLookupStatus(state, modelId),
  );
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);

  useEffect(() => {
    if (
      !name &&
      !model &&
      !historicalIdentity &&
      isUuidValue(modelId) &&
      lookupStatus === "idle"
    ) {
      void dispatch(fetchModelIdentityById(modelId));
    }
  }, [dispatch, historicalIdentity, lookupStatus, model, modelId, name]);

  const resolvedName =
    name?.trim() ||
    model?.common_name ||
    model?.name ||
    historicalIdentity?.common_name ||
    historicalIdentity?.name ||
    fallbackName("AI model", modelId);
  const mustShowId =
    showId || (!name && !model && !historicalIdentity && isUuidValue(modelId));

  return (
    <EntityRef
      token="ai_model"
      id={modelId}
      name={resolvedName}
      href={
        isSuperAdmin && !disableNavigation ? aiModelHref(modelId) : undefined
      }
      showIcon={showIcon}
      disablePeek={disableNavigation}
      disableNewTab={disableNavigation}
      openInNewTab={openInNewTab}
      alwaysShowActions={alwaysShowActions}
      wrap={mustShowId}
      className={className}
      labelClassName={labelClassName}
    >
      <IdentityLabel id={modelId} name={resolvedName} showId={mustShowId} />
    </EntityRef>
  );
}

export interface AiToolRefProps extends AiIdentityRefCommonProps {
  toolId: string;
}

export function AiToolRef({
  toolId,
  name,
  showId = false,
  showIcon = true,
  alwaysShowActions,
  openInNewTab = true,
  disableNavigation = false,
  className,
  labelClassName,
}: AiToolRefProps) {
  const dispatch = useAppDispatch();
  const selectTool = useMemo(() => makeSelectToolById(), []);
  const tool = useAppSelector((state) => selectTool(state, toolId));
  const lookupStatus = useAppSelector((state) =>
    selectToolLookupStatus(state, toolId),
  );
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);

  useEffect(() => {
    if (!name && !tool && isUuidValue(toolId) && lookupStatus === "idle") {
      void dispatch(fetchToolById(toolId));
    }
  }, [dispatch, lookupStatus, name, tool, toolId]);

  const resolvedName =
    name?.trim() || tool?.name || fallbackName("tool", toolId);
  const mustShowId = showId || (!name && !tool && isUuidValue(toolId));

  return (
    <EntityRef
      token="tool"
      id={toolId}
      name={resolvedName}
      href={isSuperAdmin && !disableNavigation ? toolHref(toolId) : undefined}
      showIcon={showIcon}
      disablePeek={disableNavigation}
      disableNewTab={disableNavigation}
      openInNewTab={openInNewTab}
      alwaysShowActions={alwaysShowActions}
      wrap={mustShowId}
      className={className}
      labelClassName={labelClassName}
    >
      <IdentityLabel id={toolId} name={resolvedName} showId={mustShowId} />
    </EntityRef>
  );
}
