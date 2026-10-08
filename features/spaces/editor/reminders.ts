"use client";

// features/spaces/editor/reminders.ts — Notion's "Remind" on a date mention (N2). The page's date mentions that
// carry `remind` for THIS person are the whole truth: after every change the set is handed to the platform's
// scheduled-notice door (`communication.reconcile_my_notices`), which schedules or moves each reminder and cancels
// any still waiting for a mention that is gone or no longer reminds. Delivery is the existing notification
// dispatcher (no timer here, none in the database). Each notice opens the page at its block.

import { useEffect, useRef, useState } from "react";

import type { RichSpan, SpaceBlock } from "@/lib/spaces-blocks/types";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";

import { dateTimeWords, remindAt } from "./date-mention";
import { usePersonTimeZone } from "@/hooks/usePersonTimeZone";

export type PageReminder = {
  source_key: string;
  deliver_at: string;
  subject: { title: string; body: string };
  deep_link: string;
};

const plain = (spans: RichSpan[] | undefined) => (spans ?? []).map((s) => s.text).join("").replace(/\s+/g, " ").trim();

/** The scope every reminder of one page lives under. */
export const reminderScope = (spaceId: string) => `spaces:${spaceId}:`;

/** Every reminder `userId` set on this page, one per reminded date mention (block id + its place in the block). */
export function pageReminders(spaceId: string, title: string, blocks: SpaceBlock[], userId: string, zone: string): PageReminder[] {
  const out: PageReminder[] = [];
  const walk = (list: SpaceBlock[]) => {
    for (const b of list) {
      let n = 0;
      for (const s of b.text ?? []) {
        const m = s.mention;
        if (m?.kind !== "date" || !m.remind || m.remind.userId !== userId) continue;
        const at = remindAt(m.iso, m.remind.offset, zone);
        if (!at) continue;
        const line = plain(b.text);
        out.push({
          source_key: `${reminderScope(spaceId)}${b.id}:${n++}`,
          deliver_at: at.toISOString(),
          subject: {
            title: `Reminder: ${title.trim() || "Untitled"}`,
            body: line.length > 140 ? `${line.slice(0, 139)}…` : line || dateTimeWords(m.iso, new Date(), zone),
          },
          deep_link: `/spaces/${spaceId}#block-${b.id}`,
        });
      }
      if (b.children?.length) walk(b.children);
    }
  };
  walk(blocks);
  return out;
}

/** Keeps this person's reminders on the page in step with its date mentions (debounced; unchanged sets send nothing). */
export function usePageReminders(
  spaceId: string,
  title: string,
  blocks: SpaceBlock[] | undefined,
  userId: string | null,
  on: boolean,
  /** The page's organization when the page read carried it (round 40: then nothing is asked here). */
  knownOrganizationId?: string,
) {
  const [readOrganizationId, setOrganizationId] = useState<string | null>(null);
  const organizationId = knownOrganizationId ?? readOrganizationId;
  const sent = useRef<string | null>(null);
  // A reminder fires at its time in the person's own zone (their saved time zone, not the device's clock).
  const zone = usePersonTimeZone();

  // The reminder belongs to the page's own organization (never the active one).
  useEffect(() => {
    if (!on || knownOrganizationId) return;
    let live = true;
    void supabase
      .schema("content")
      .from("document")
      .select("organization_id")
      .eq("id", spaceId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!live) return;
        if (error) toast.error(`Reminders are off on this page: ${error.message}`);
        else setOrganizationId(data?.organization_id ?? null);
      });
    return () => {
      live = false;
    };
  }, [spaceId, on, knownOrganizationId]);

  useEffect(() => {
    if (!on || !userId || !organizationId || !blocks) return;
    const set = pageReminders(spaceId, title, blocks, userId, zone);
    const key = JSON.stringify(set);
    if (key === sent.current) return;
    const timer = window.setTimeout(() => {
      sent.current = key;
      void supabase
        .schema("communication")
        .rpc("reconcile_my_notices", { p_scope: reminderScope(spaceId), p_notices: set, p_organization_id: organizationId })
        .then(({ error }) => {
          if (error) {
            sent.current = null;
            toast.error(`Reminder not saved: ${error.message}`);
          }
        });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [spaceId, title, blocks, userId, organizationId, on, zone]);
}
