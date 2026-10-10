"use client";

// features/flashcards/components/sharing/DeckRowAccess.tsx
//
// A deck's row controls — "Shown to" and "Published to the web" — through the one RowAccessControl
// (access ladder Words table). A share without publishing is an Anyone link, made in Share.
// Published to the web opens the deck's own public page (/p/e/fc_set/<id>) to anyone, signed in or not.

import { useEffect, useState } from "react";
import { RowAccessControl } from "@/components/row-access/RowAccessControl";
import { supabase } from "@/utils/supabase/client";
import type { RowAccessChange } from "@/lib/row-access/columns";
import { fcService } from "../../data/fcService";
import type { FcSetRow } from "../../data/types";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
export type DeckRowAccessValue = Pick<FcSetRow, "shown_to" | "published_to_web">;

/** Save a deck's row controls; throws a sentence a person can read. */
export async function saveDeckRowAccess(
  setId: string,
  change: RowAccessChange,
): Promise<FcSetRow> {
  const res = await fcService.updateSetRowAccess(setId, change);
  if (res.error || !res.data) throw new Error(res.error ?? "The deck's settings were not saved.");
  return res.data;
}

export function DeckRowAccess({
  setId,
  value,
  onChange,
  size,
}: {
  setId: string;
  value: DeckRowAccessValue;
  onChange: (next: DeckRowAccessValue) => void;
  size?: "sm" | "default";
}) {
  return (
    <RowAccessControl
      size={size}
      value={{ shownTo: value.shown_to, publishedToWeb: value.published_to_web }}
      publicUrl={
        typeof window === "undefined" ? undefined : `${window.location.origin}/p/e/fc_set/${setId}`
      }
      save={async (patch) => {
        const saved = await saveDeckRowAccess(setId, patch);
        onChange({ shown_to: saved.shown_to, published_to_web: saved.published_to_web });
      }}
    />
  );
}

/**
 * The same control for a deck known only by id (the library row menu — the list RPC does not carry
 * the row controls yet). Reads the two columns, then renders the control; a failed read says so.
 */
export function DeckRowAccessById({ setId }: { setId: string }) {
  const [value, setValue] = useState<DeckRowAccessValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void supabase
      .schema("education")
      .from("fc_set")
      .select("shown_to, published_to_web")
      .eq("id", setId)
      .single()
      .then(({ data, error: readError }) => {
        if (!live) return;
        if (readError || !data) setError(readError?.message ?? "The deck was not found.");
        else setValue(data);
      });
    return () => {
      live = false;
    };
  }, [setId]);
  if (error) return <p className="text-sm text-destructive">Couldn&apos;t read this deck: {error}<ErrorAlchemyMenu error={error} /></p>;
  if (!value) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return <DeckRowAccess setId={setId} size="default" value={value} onChange={setValue} />;
}
