"use client";

// features/spaces/page/Backlinks.tsx — A12: "N backlinks" under the title (hidden at 0); a click lists the
// pages that mention this one (icon + title). The database answers only pages the viewer can open.

import { useEffect, useState } from "react";

import { supabase } from "@/utils/supabase/client";

import type { SpaceMedia } from "../contract";
import { useSpaces } from "../state/SpacesProvider";
import { SpaceIcon } from "./SpaceIcon";
import { useSeededBacklinks } from "./space-links";

interface Backlink {
  id: string;
  title: string;
  icon: SpaceMedia | null;
}

type BacklinkRpc = (fn: "space_backlinks", args: { p_space_id: string }) => PromiseLike<{ data: Backlink[] | null; error: { message: string } | null }>;

export function Backlinks({ spaceId }: { spaceId: string }) {
  const { open } = useSpaces();
  // Round 40: the route read them beside the page (in the HTML, no shift); asked here only when it did not.
  const seeded = useSeededBacklinks(spaceId) as Backlink[] | undefined;
  const [rows, setRows] = useState<Backlink[]>(seeded ?? []);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (seeded) return;
    let live = true;
    const content = supabase.schema("content") as unknown as { rpc: BacklinkRpc };
    void Promise.resolve(content.rpc("space_backlinks", { p_space_id: spaceId })).then(({ data }) => {
      if (live) setRows(data ?? []);
    });
    return () => {
      live = false;
    };
  }, [spaceId, seeded]);

  if (rows.length === 0) return null;
  return (
    <div className="spaces-backlinks">
      <button type="button" className="spaces-backlinks-toggle" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
        {rows.length} {rows.length === 1 ? "backlink" : "backlinks"}
      </button>
      {expanded ? (
        <div className="spaces-backlinks-list">
          {rows.map((r) => (
            <button key={r.id} type="button" className="spaces-backlinks-item" onClick={() => open(r.id)}>
              <SpaceIcon media={r.icon} size={16} />
              <span>{r.title || "Untitled"}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
