"use client";

/**
 * Everything a run set aside, counted AND openable (NEWS-ENGINE-SPEC §0.6,
 * §7.5 "a count alone is hiding", and the 2026-09-27 rulings): rejected,
 * withheld, pre-gated, below the selection floor, dropped before scoring, and
 * already surfaced before. Each row opens its list. A list the run records only
 * as counts says exactly that.
 */

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { TrackerStoryRow } from "@/features/marketing/data/coverage-types";

import { humanize, type SetAsideList } from "./run-document";
import { domainOf, SmartLink } from "./kinds/shared";

export function SetAsideLists({
  lists,
  stories,
  storyActions,
  initiallyOpen,
}: {
  lists: SetAsideList[];
  stories: Map<string, TrackerStoryRow>;
  storyActions: (storyKey: string) => ReactNode;
  initiallyOpen?: SetAsideList["id"] | null;
}) {
  const [open, setOpen] = useState<SetAsideList["id"] | null>(initiallyOpen ?? null);
  return (
    <section className="rounded-md border border-border bg-card p-3" data-surface-value="news_set_aside">
      <h2 className="text-sm font-semibold text-foreground">What this run set aside</h2>
      <p className="text-xs text-muted-foreground">
        Nothing is hidden. Only hygiene and brand safety withhold a story; everything else is
        listed with its reason.
      </p>
      <ul className="mt-2 flex flex-col divide-y divide-border">
        {lists.map((list) => {
          const isOpen = open === list.id;
          return (
            <li key={list.id} className="py-1.5" data-set-aside={list.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 text-left text-sm"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : list.id)}
              >
                {isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="font-medium text-foreground">{list.label}</span>
                <span className="text-muted-foreground">· {list.count}</span>
              </button>
              {isOpen ? (
                <div className="ml-5 mt-1 flex flex-col gap-1.5">
                  <p className="text-xs text-muted-foreground">{list.explain}</p>
                  {Object.keys(list.byReason).length ? (
                    <p className="text-xs text-foreground">
                      {Object.entries(list.byReason)
                        .map(([k, n]) => `${humanize(k)}: ${n}`)
                        .join(" · ")}
                    </p>
                  ) : null}
                  {list.items.length ? (
                    <ul className="flex flex-col gap-1">
                      {list.items.map((item, i) => (
                        <li key={`${item.id}-${i}`} className="text-sm">
                          <div className="flex flex-wrap items-center gap-x-2">
                            <span className="text-foreground">{item.title || item.id}</span>
                            {item.reason ? (
                              <span className="text-[11px] text-muted-foreground">{humanize(item.reason)}</span>
                            ) : null}
                            {item.id ? storyActions(item.id) : null}
                          </div>
                          {item.rationale ? (
                            <p className="text-xs text-muted-foreground">{item.rationale}</p>
                          ) : null}
                          {item.urls.length ? (
                            <p className="flex flex-wrap gap-x-2 text-xs">
                              {item.urls.slice(0, 3).map((u) => (
                                <SmartLink key={u} href={u}>
                                  {domainOf(u)}
                                </SmartLink>
                              ))}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : list.ids.length ? (
                    <ul className="flex flex-col gap-1">
                      {list.ids.map((id) => {
                        const story = stories.get(id);
                        return (
                          <li key={id} className="flex flex-wrap items-center gap-x-2 text-sm">
                            <span className="text-foreground">
                              {story?.title ?? (
                                <span className="text-muted-foreground">
                                  Story {id} — the run kept its id only, not its headline
                                </span>
                              )}
                            </span>
                            {story ? storyActions(id) : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : list.count > 0 && !list.listed ? (
                    <p className="text-xs text-muted-foreground">
                      This run recorded these as counts only, not as a list.
                    </p>
                  ) : list.count === 0 ? (
                    <p className="text-xs text-muted-foreground">None this run.</p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
