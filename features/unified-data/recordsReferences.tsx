"use client";

/**
 * THE RECORD STORE'S REFERENCE AND KIND PORTS (records-ui `renderReference` / `renderKind`, lane
 * REFERENCE-CARRY).
 *
 *   renderReference  one reference chip → the platform's ONE door, `EntityRef` (route, new tab,
 *                    peek from the entity registry). A relation's value is a store record
 *                    (`token: "record"`): it opens at `/o/<id>`, the address that resolves any id
 *                    the platform mints (`platform.resolve_id`).
 *   renderKind       a cell whose value names its own shape. A Matrx directive — the current
 *                    `directive_v1_*` shell or the retired ```matrx {"matrx_version":1,…}``` one,
 *                    which only `@ai-matrx/content-ir`'s decoder translates — renders through the
 *                    ONE directive renderer (`MatrxEnvelopeBlock` → `DirectiveRender`), so a stored
 *                    reference reads as the same chips a chat message shows. Any other `__kind` is a
 *                    compact button naming the kind that opens the canonical `structuredValueWindow`
 *                    (the kind's own component, floor `StructuredValueView`).
 */

import type { ReactNode } from "react";
import { Shapes } from "lucide-react";
import { tryDecodeDirective } from "@ai-matrx/content-ir/directives";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { detailPageHref } from "@/features/window-panels/detail/DetailHost";
import MatrxEnvelopeBlock from "@/features/matrx-envelope/MatrxEnvelopeBlock";
import { useOpenStructuredValueWindow } from "@/features/overlays/openers/structuredValueWindow";

/** records-ui `ReferenceChipRef` — spelled here so this binding compiles against the package before and after it gains the port. */
interface ReferenceArgs {
  token: string;
  id: string;
  label: string | null;
  tableId?: string | undefined;
}
/** records-ui `renderKind`'s argument. */
interface KindArgs {
  value: Record<string, unknown>;
  kind: string;
  where: "cell" | "panel";
  title: string;
}

export function recordsRenderReference(ref: ReferenceArgs): ReactNode {
  const name = ref.label ?? undefined;
  if (ref.token === "record") {
    return <EntityRef token="record" id={ref.id} name={name} href={`/o/${ref.id}`} showIcon={false} disablePeek />;
  }
  // A kind with no screen of its own opens at its durable address, the Detail page (`/detail/<token>/<id>`)
  // — never a chip that looks openable and goes nowhere (27 kinds had no route, attack 2026-09-28).
  const routed = Boolean(tryGetEntityInfo(ref.token)?.hrefFor);
  return <EntityRef token={ref.token} id={ref.id} name={name} {...(routed ? {} : { href: detailPageHref({ type: ref.token, id: ref.id }) })} />;
}

/** "reference · scope" / "directive_v1_reference_scope" / "table_v1" → words a person reads. */
function kindWords(kind: string): string {
  const words = kind.replace(/^directive_v\d+_/, "").replace(/_v\d+$/, "").replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Structured value";
}

function KindValueButton({ value, kind, title }: KindArgs) {
  const openWindow = useOpenStructuredValueWindow();
  const words = kindWords(kind);
  return (
    <button
      type="button"
      className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[11px] text-foreground hover:bg-accent"
      title={`Open ${words}`}
      data-records-kind-button={kind}
      onClick={(event) => {
        event.stopPropagation();
        openWindow({ value, title: words, subtitle: title });
      }}
    >
      <Shapes className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="truncate">{words}</span>
    </button>
  );
}

export function recordsRenderKind(args: KindArgs): ReactNode {
  // The ONE decoder says whether this is a directive (it alone understands the retired shell); a
  // directive it cannot honour falls to the button, whose window shows the value as it is.
  if (tryDecodeDirective(args.value, (why) => console.warn(`[records kind cell] ${why}`))) {
    return (
      <span className="min-w-0 max-w-full text-[11px]" data-records-kind-directive="" onClick={(event) => event.stopPropagation()}>
        <MatrxEnvelopeBlock content={args.value} />
      </span>
    );
  }
  return <KindValueButton {...args} />;
}

export const RECORDS_REFERENCES = { renderReference: recordsRenderReference, renderKind: recordsRenderKind };
