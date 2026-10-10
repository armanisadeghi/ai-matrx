"use client";

import { useEffect, useState } from "react";
import { PenLine, Star, Trash2 } from "lucide-react";
import { Button, EmptyState, RegionSkeleton } from "@ai-matrx/design-system/controls";
import { InlineMediaRef } from "@ai-matrx/media/react";

import { cn } from "@/lib/utils";
import { PAPER } from "../../contract/paper";
import { fontStack } from "../fonts";
import { savedSignaturesApi, type SavedSignature } from "../services";
import { styleByKey } from "../styles";
import type { Candidate } from "../types";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
export function Thumb({ item }: { item: SavedSignature }) {
  if (item.preview_url) {
    // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL of the stored mark; next/image would need a remote pattern for it
    return <img src={item.preview_url} alt="" className="max-h-full max-w-full object-contain" />;
  }
  if (item.kind === "typed" && item.typed_text) {
    const style = styleByKey(item.typed_style);
    return (
      <span className="truncate leading-none" style={{ fontFamily: fontStack(style), color: PAPER.ink, fontSize: `${1.5 * style.previewScale}rem` }}>
        {item.typed_text}
      </span>
    );
  }
  return <InlineMediaRef ref={item.image_file_id} size="fill" fit="contain" alt="Saved signature" />;
}

export function SavedTab({
  target,
  selectedId,
  onPick,
}: {
  target: "signature" | "initials";
  selectedId: string | null;
  onPick: (c: Candidate | null, item: SavedSignature | null) => void;
}) {
  const [items, setItems] = useState<SavedSignature[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    savedSignaturesApi
      .list()
      .then((rows) => live && setItems(rows.filter((r) => r.target === target)))
      .catch((e: unknown) => live && setProblem(e instanceof Error ? e.message : "Could not load saved signatures."));
    return () => {
      live = false;
    };
  }, [target]);

  if (problem) return <p role="alert" className="text-sm text-destructive">{problem}<ErrorAlchemyMenu error={problem} /></p>;
  if (!items) return <RegionSkeleton shape="rows" count={2} aria-label="Loading saved signatures" />;
  if (items.length === 0) {
    return <EmptyState icon={<PenLine />} title="Nothing saved yet" line="Adopt one and keep it for next time." />;
  }

  const act = async (fn: () => Promise<void>) => {
    try {
      await fn();
      setItems(await savedSignaturesApi.list().then((rows) => rows.filter((r) => r.target === target)));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That did not work.");
    }
  };

  return (
    <ul className="flex max-h-[34dvh] flex-col gap-2 overflow-y-auto pr-1">
      {items.map((item) => {
        const selected = item.id === selectedId;
        return (
          <li key={item.id} className="flex items-center gap-2">
            <button
              type="button"
              data-clickable
              aria-pressed={selected}
              aria-label={`Use saved ${item.target}${item.is_default ? " (default)" : ""}`}
              onClick={() =>
                onPick(
                  {
                    kind: item.kind,
                    source: "saved",
                    saved_signature_id: item.id,
                    preview_url: item.preview_url ?? "",
                  },
                  item,
                )
              }
              className={cn(
                "flex h-14 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-md border px-3",
                selected ? "border-primary" : "border-border",
              )}
              style={{ background: PAPER.page }}
            >
              <Thumb item={item} />
            </button>
            <Button
              variant={item.is_default ? "outline" : "quiet"}
              icon={<Star />}
              aria-label={item.is_default ? "Default" : "Make default"}
              disabled={item.is_default}
              onClick={() => void act(() => savedSignaturesApi.setDefault(item.id))}
            />
            <Button variant="quiet" icon={<Trash2 />} aria-label="Delete saved signature" onClick={() => void act(() => savedSignaturesApi.remove(item.id))} />
          </li>
        );
      })}
    </ul>
  );
}
