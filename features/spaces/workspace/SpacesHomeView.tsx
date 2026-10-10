"use client";

// features/spaces/workspace/SpacesHomeView.tsx — E4: Notion Home at /spaces/home (the sidebar's Home row).
//
// Recently visited: cards of the pages this person opened last (the provider's per-browser `recent`, how many =
// knob spaces.home.recent_count). Upcoming: their own pending page reminders within knob spaces.home.upcoming_days
// (door content.space_upcoming). Your pages: the top level of the tree, most recently edited first.

import { CalendarClock, Clock, FileText } from "lucide-react";
import { useEffect, useState } from "react";

import { supabase } from "@/utils/supabase/client";

import type { SpaceSummary } from "../contract";
import { SpaceIcon } from "../page/SpaceIcon";
import { editedAgo } from "../page/time";
import { useSpacesKnob } from "../state/knobs";
import { useSpaces } from "../state/SpacesProvider";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
interface Upcoming {
  space_id: string;
  due_at: string;
  title: string;
  body: string | null;
  deep_link: string | null;
}

function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function useUpcoming(days: number): { rows: Upcoming[] | null; failed: boolean } {
  const [state, setState] = useState<{ rows: Upcoming[] | null; failed: boolean }>({ rows: null, failed: false });
  useEffect(() => {
    let live = true;
    const until = new Date(Date.now() + days * 86_400_000).toISOString();
    void (supabase.schema("content") as unknown as { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: Upcoming[] | null; error: { message: string } | null }> })
      .rpc("space_upcoming", { p_until: until, p_limit: 20 })
      .then(({ data, error }) => {
        if (!live) return;
        if (error) console.error("[spaces] upcoming reminders", error.message);
        setState({ rows: data ?? [], failed: !!error });
      });
    return () => {
      live = false;
    };
  }, [days]);
  return state;
}

function dueWords(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const day = same(d, today) ? "Today" : same(d, tomorrow) ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return { day, time: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) };
}

export function SpacesHomeView() {
  const spaces = useSpaces();
  const recentCount = useSpacesKnob("homeRecentCount");
  const upcomingDays = useSpacesKnob("homeUpcomingDays");
  const upcoming = useUpcoming(upcomingDays);
  const recent = spaces.recent
    .map((id) => spaces.byId.get(id))
    .filter((s): s is SpaceSummary => !!s && !s.isArchived)
    .slice(0, recentCount);
  const yours = [...spaces.childrenOf(null)].filter((s) => !s.isArchived).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="spaces-home" data-spaces-home="">
      <h1 className="spaces-home-greeting">{greeting()}</h1>

      <section className="spaces-home-section" aria-label="Recently visited">
        <h2 className="spaces-home-heading">
          <Clock size={14} /> Recently visited
        </h2>
        {recent.length ? (
          <div className="spaces-home-cards">
            {recent.map((s) => (
              <button key={s.id} type="button" className="spaces-home-card" onClick={() => spaces.open(s.id)}>
                <span className="spaces-home-card-top" />
                <span className="spaces-home-card-icon">{s.icon ? <SpaceIcon media={s.icon} size={26} /> : <FileText size={24} strokeWidth={1.5} />}</span>
                <span className="spaces-home-card-title">{s.title || "Untitled"}</span>
                <span className="spaces-home-card-meta">{editedAgo(s.updatedAt)}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="spaces-home-empty">{spaces.ready ? "Pages you open show up here." : ""}</p>
        )}
      </section>

      <section className="spaces-home-section" aria-label="Upcoming">
        <h2 className="spaces-home-heading">
          <CalendarClock size={14} /> Upcoming
        </h2>
        {upcoming.rows === null ? (
          <div className="spaces-home-list" aria-busy="true" />
        ) : upcoming.rows.length ? (
          <div className="spaces-home-list">
            {upcoming.rows.map((r, i) => {
              const when = dueWords(r.due_at);
              const page = spaces.byId.get(r.space_id);
              return (
                <button key={`${r.space_id}-${i}`} type="button" className="spaces-home-row" data-upcoming="" onClick={() => spaces.open(r.space_id)}>
                  <span className="spaces-home-when">
                    <span className="spaces-home-day">{when.day}</span>
                    <span className="spaces-home-time">{when.time}</span>
                  </span>
                  <span className="spaces-home-row-text">
                    <span className="truncate">{r.body || r.title}</span>
                    <span className="spaces-home-row-page truncate">{page?.title || r.title.replace(/^Reminder:\s*/, "") || "Untitled"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p data-error-box className="spaces-home-empty">{upcoming.failed ? "Upcoming reminders could not be read." : "No reminders coming up. Add one with @remind on any page."}<ErrorAlchemyMenu /></p>
        )}
      </section>

      <section className="spaces-home-section" aria-label="Your pages">
        <h2 className="spaces-home-heading">
          <FileText size={14} /> Your pages
        </h2>
        <div className="spaces-home-list">
          {yours.map((s) => (
            <button key={s.id} type="button" className="spaces-home-row" onClick={() => spaces.open(s.id)}>
              <span className="spaces-home-row-icon">{s.icon ? <SpaceIcon media={s.icon} size={18} /> : <FileText size={18} strokeWidth={1.6} />}</span>
              <span className="spaces-home-row-text">
                <span className="truncate">{s.title || "Untitled"}</span>
              </span>
              <span className="spaces-home-row-meta">{editedAgo(s.updatedAt)}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
