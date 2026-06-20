"use client";

/**
 * CtxPatchInline — inline + overlay renderer for the `ctx_patch` tool call.
 *
 * `ctx_patch` mutates a context object. Args: `{ key, command }` where
 * command ∈ str_replace | insert | append | prepend | overwrite |
 * json_patch | json_merge. The result is a write outcome whose exact shape
 * varies (e.g. `{ key, command, ok?/success? }`), so we read it defensively.
 *
 * Renders a clean write-confirmation card: a check icon, "Updated <key>", and
 * the command as a Badge. If the result carries a preview / new value (under
 * common keys like `preview`, `new_value`, `content`, `value`, `output`), we
 * surface it via `<ResultValue>`. Errors render through `ToolErrorCard`.
 */

import React, { useMemo } from "react";
import { CheckCircle2, FilePen } from "lucide-react";
import { Badge } from "@/components/ui/badge";

import type { ToolRendererProps } from "../../types";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { getArg, isTerminal, resultAsObject } from "../_shared";
import { ResultValue, type ResultDensity } from "../../result-fields/ResultValue";
import { ToolErrorCard } from "../../result-fields/ToolErrorCard";
import { WORKING_DOCUMENT_CONTEXT_KEY } from "@/features/agents/utils/workingDocumentContext";
import { WorkingDocDiffInline } from "../working-document/WorkingDocDiffInline";

/** Keys a write outcome might use to carry an echoed/previewed value. */
const PREVIEW_KEYS = [
  "preview",
  "new_value",
  "new_content",
  "content",
  "value",
  "output",
  "result",
] as const;

interface ParsedPatch {
  key: string;
  command: string | null;
  preview: unknown;
}

function parse(entry: ToolLifecycleEntry): ParsedPatch {
  const keyArg = (getArg<string>(entry, "key") ?? "").trim();
  const commandArg = getArg<string>(entry, "command");
  const result = resultAsObject(entry);

  const key =
    (result && typeof result.key === "string" ? result.key : "") || keyArg;
  const command =
    (result && typeof result.command === "string" ? result.command : null) ??
    (typeof commandArg === "string" ? commandArg : null);

  let preview: unknown = undefined;
  if (result) {
    for (const k of PREVIEW_KEYS) {
      if (result[k] != null) {
        preview = result[k];
        break;
      }
    }
  }

  return { key, command, preview };
}

interface Props extends ToolRendererProps {
  density?: ResultDensity;
}

/**
 * Dispatcher: when this patch targets the working document AND we're live (have
 * a conversation, not a reloaded snapshot), render the live before→after diff.
 * Otherwise fall through to the standard write-confirmation card below.
 *
 * No hooks run before this branch, so the two render paths owning different
 * hooks is safe under the Rules of Hooks (each is its own component).
 */
export const CtxPatchInline: React.FC<Props> = (props) => {
  const { entry, isPersisted, conversationId } = props;
  if (
    !isPersisted &&
    conversationId &&
    getArg<string>(entry, "key") === WORKING_DOCUMENT_CONTEXT_KEY
  ) {
    return <WorkingDocDiffInline {...props} />;
  }
  return <CtxPatchConfirmation {...props} />;
};

const CtxPatchConfirmation: React.FC<Props> = ({
  entry,
  onOpenOverlay,
  toolGroupId,
  density = "inline",
}) => {
  const data = useMemo(() => parse(entry), [entry]);

  if (entry.status === "error") {
    return (
      <ToolErrorCard
        entry={entry}
        onOpenOverlay={onOpenOverlay}
        toolGroupId={toolGroupId}
      />
    );
  }

  if (!isTerminal(entry)) {
    return (
      <div className="flex items-center gap-2 py-1.5 text-xs text-muted-foreground animate-in fade-in">
        <FilePen className="h-3.5 w-3.5 shrink-0" />
        <span>
          Updating{" "}
          {data.key ? (
            <span className="font-mono text-foreground">{data.key}</span>
          ) : (
            "context"
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2 animate-in fade-in">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-sm text-foreground">
          Updated{" "}
          <span className="font-mono font-medium">
            {data.key || "context"}
          </span>
        </span>
        {data.command && (
          <Badge variant="secondary" className="ml-auto font-mono font-normal">
            {data.command}
          </Badge>
        )}
      </div>

      {data.preview != null && (
        <div className="min-w-0 border-t border-border pt-2">
          <ResultValue value={data.preview} density={density} />
        </div>
      )}
    </div>
  );
};
