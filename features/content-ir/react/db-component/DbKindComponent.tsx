"use client";

/**
 * DbKindComponent — lazy entry point for DB-sourced kind components,
 * modeled directly on tool-viz's DbToolRenderer shell/Impl split.
 *
 * `DbKindComponentImpl` reaches `@ai-matrx/code-runtime`'s compiler, which
 * statically imports `@babel/standalone`.
 * Loading the impl via `next/dynamic({ ssr: false })` keeps Babel OUT of the
 * main chat/notes bundle: the chunk is fetched only when a block actually
 * routed to a DB kind component (`applyIrKindRoute`'s db-override flip) and
 * this component mounts — the condition IS the route decision.
 *
 * `loading: () => null` — compile is synchronous and fast once the chunk
 * lands; a spinner would only flash.
 */
import dynamic from "next/dynamic";
import React from "react";

import type { DbKindComponentImplProps } from "./DbKindComponentImpl";
import { useKindActionRunner } from "../actions/useKindActionRunner";
import type { KindItemStateHandle } from "../actions/kind-action-context";
import { readEnvelope } from "../../redux/render-block-envelope";
import { BlockStateHost } from "@/features/block-state/BlockStateContext";
import { useBlockState } from "@/features/block-state/useBlockState";
import { useItemStateImages } from "./item-state-media";
import {
  KindComponentFixBadge,
  useCanFixKindComponent,
} from "./KindComponentFixBadge";
import { cn } from "@/lib/utils";

const LazyImpl = dynamic(
  () =>
    import("./DbKindComponentImpl").then((m) => ({
      default: m.DbKindComponentImpl,
    })),
  { ssr: false, loading: () => null },
);

// The public wrapper props ARE the impl props MINUS what the shell binds: the
// action seam and the item's durable state (it's the always-client boundary,
// under the Redux provider), so callers never supply them.
export type DbKindComponentProps = Omit<
  DbKindComponentImplProps,
  "runAction" | "itemState" | "itemStateImages"
> & {
  /**
   * Where this item lives in a chat answer. Given, the item gets durable state
   * (`itemState`, `save_item_state`, `run_shortcut` saveAs) keyed to that
   * answer's block. Absent (a preview, a dialog), actions that save say so.
   */
  chatBlock?: {
    conversationId?: string | null;
    messageId?: string | null;
    blockIndex: number;
    streaming?: boolean;
  };
};

function kindOf(content: string, metadata: Record<string, unknown> | undefined): string {
  const fromEnvelope = readEnvelope(metadata)?.root.kind;
  if (fromEnvelope) return fromEnvelope;
  try {
    const parsed = JSON.parse(content) as { __kind?: unknown } | null;
    if (parsed && typeof parsed.__kind === "string") return parsed.__kind;
  } catch {
    /* streaming / non-JSON content: no kind yet */
  }
  return "db_kind_component";
}

const DbKindComponentShell: React.FC<Omit<DbKindComponentProps, "chatBlock">> = (props) => {
  // The item's durable state. Unhosted (no BlockStateHost above) it is a
  // local-only store and `hosted` is false, so save actions refuse honestly.
  const { state, patch, hosted } = useBlockState({ title: null });
  const itemStateValue = state ?? null;
  const stateRef = React.useRef<Record<string, unknown>>({});
  stateRef.current = (itemStateValue as Record<string, unknown> | null) ?? {};
  const itemState: KindItemStateHandle = {
    hosted,
    read: () => stateRef.current,
    patch,
  };
  // Bind the action runner here (client, under the provider) and hand it to the
  // compiled component. Keeping this in the shell — not the impl — keeps the
  // impl bare-renderable (tests/SSR) and Redux out of that path.
  const runAction = useKindActionRunner(undefined, { itemState });
  // Saved images are file ids; the host loads their bytes so the component can show them.
  const itemStateImages = useItemStateImages(itemStateValue as Record<string, unknown> | null);
  // The wrapper reserves the badge's corner inside its own box. Chat
  // intentionally clips horizontal overflow to contain wide model output, so a
  // negative right offset gets cut regardless of z-index — keeping the gutter
  // in-flow makes the badge immune to host overflow clipping everywhere this
  // renderer appears.
  //
  // The band must clear the badge's FULL 24px height, not the 8px it used to
  // get: at 8px the badge overlapped the component's own top-right by 16px and,
  // sitting at the popover layer, swallowed every click in that square. The
  // shell cannot know what an arbitrary DB-authored component draws up there,
  // so it reserves the whole band and leaves nothing behind the badge.
  // Reserved only when the badge actually renders (author / super admin), so
  // ordinary viewers keep the original 8px gutter and their layout is unchanged.
  const { canFix } = useCanFixKindComponent(props.content, props.metadata);
  return (
    <div className={cn("relative pr-2", canFix ? "pt-7" : "pt-2")}>
      <KindComponentFixBadge content={props.content} metadata={props.metadata} />
      <LazyImpl
        {...props}
        runAction={runAction}
        itemState={itemStateValue as Record<string, unknown> | null}
        itemStateImages={itemStateImages}
      />
    </div>
  );
};

export const DbKindComponent: React.FC<DbKindComponentProps> = ({ chatBlock, ...props }) => {
  if (!chatBlock) return <DbKindComponentShell {...props} />;
  return (
    <BlockStateHost
      kind={kindOf(props.content, props.metadata)}
      conversationId={chatBlock.conversationId ?? null}
      messageId={chatBlock.messageId ?? null}
      blockIndex={chatBlock.blockIndex}
      content={chatBlock.streaming ? undefined : props.content}
      streaming={chatBlock.streaming}
    >
      <DbKindComponentShell {...props} />
    </BlockStateHost>
  );
};

export default DbKindComponent;
