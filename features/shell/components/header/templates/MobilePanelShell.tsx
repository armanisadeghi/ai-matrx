"use client";

// MobilePanelShell — the drop-in mobile treatment for any multi-pane route
// (IDE, split editors, sidebar+detail workspaces, inspector rails).
//
// Desktop (>= md): renders `desktop` VERBATIM. Whatever resizable/split layout
//                  the route already has is untouched — zero regression risk.
// Mobile  (< md):  renders `main` as one full-height scrolling column, and each
//                  side panel becomes an iOS-style BOTTOM DRAWER reachable from
//                  ONE "…" tap target portaled into the shell header's right
//                  slot. Nothing is crammed into the phone header, and no panel
//                  silently disappears.
//
//   <MobilePanelShell
//     desktop={<ResizablePanelGroup>…existing layout…</ResizablePanelGroup>}
//     main={<Editor />}
//     panels={[
//       { id: "files", label: "Files", icon: Folder, content: <FileTree /> },
//       { id: "chat",  label: "Chat",  icon: MessageCircle, content: <ChatPanel /> },
//     ]}
//   />
//
// Rules this encodes (see .claude/skills/core-route-headers/SKILL.md):
//   - Few things in the phone header; everything else in a drawer.
//   - Tap targets carry their own 44px geometry — never wrap them in padding.
//   - The route body still owns header clearance (pt-[var(--shell-header-h)]);
//     this component does not add chrome to the body.
//
// Panels are mounted lazily (only once opened) so a phone never pays to render
// an inspector the user hasn't asked for. Pass `alwaysMount` for a panel that
// must keep live state (e.g. a running terminal).

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import PageHeaderRightPortal from "@/features/shell/components/header/PageHeaderRightPortal";
import { TapTargetButton } from "@/components/icons/TapTargetButton";
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetHeader,
} from "@/components/official/bottom-sheet/BottomSheet";
import { cn } from "@/lib/utils";

export interface MobileShellPanel {
  id: string;
  label: string;
  icon?: LucideIcon;
  content: React.ReactNode;
  /** Keep mounted (hidden) instead of lazy-mounting on first open. */
  alwaysMount?: boolean;
}

export interface MobilePanelShellProps {
  /** The desktop layout, rendered verbatim at >= md. */
  desktop: React.ReactNode;
  /** The primary pane on a phone (editor, document, conversation…). */
  main: React.ReactNode;
  /** Secondary panes — each becomes a bottom drawer on a phone. */
  panels?: MobileShellPanel[];
  /** Extra class on the mobile main column. */
  mainClassName?: string;
}

export function MobilePanelShell({
  desktop,
  main,
  panels,
  mainClassName,
}: MobilePanelShellProps) {
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openPanelId, setOpenPanelId] = useState<string | null>(null);
  const [everOpened, setEverOpened] = useState<Set<string>>(() => new Set());

  // A panel typically hosts real navigation (e.g. a settings/section tree of
  // <Link>s). Once a route change lands, auto-dismiss so the user sees the
  // page they just navigated to instead of the drawer still covering it.
  // (Adjusting state during render on prop change — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  // — rather than a `useEffect`, which would cause an extra commit.)
  const pathname = usePathname();
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpenPanelId(null);
    setMenuOpen(false);
  }

  if (!isMobile) return <>{desktop}</>;

  const hasPanels = Boolean(panels && panels.length > 0);
  const openPanel = panels?.find((p) => p.id === openPanelId) ?? null;

  const show = (id: string) => {
    setEverOpened((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    setMenuOpen(false);
    setOpenPanelId(id);
  };

  return (
    <>
      {hasPanels && (
        <PageHeaderRightPortal>
          <TapTargetButton
            icon={<MoreHorizontal className="h-4 w-4" />}
            ariaLabel="Panels"
            onClick={() => setMenuOpen(true)}
          />
        </PageHeaderRightPortal>
      )}

      <div className={cn("h-full min-h-0 overflow-auto", mainClassName)}>
        {main}
      </div>

      {/* Panels that opted out of lazy mounting stay alive off-screen. */}
      {panels
        ?.filter((p) => p.alwaysMount && p.id !== openPanelId)
        .map((p) => (
          <div key={p.id} className="hidden" aria-hidden>
            {p.content}
          </div>
        ))}

      {/* Panel picker */}
      {hasPanels && (
        <BottomSheet open={menuOpen} onOpenChange={setMenuOpen} title="Panels">
          <BottomSheetHeader
            title="Panels"
            trailing={
              <button
                onClick={() => setMenuOpen(false)}
                className="min-h-[44px] px-1 text-[15px] text-primary active:opacity-70"
              >
                Done
              </button>
            }
          />
          <BottomSheetBody>
            {panels?.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  onClick={() => show(p.id)}
                  className="flex min-h-[52px] w-full items-center border-b border-glass-edge px-5 text-left transition-colors last:border-0 active:bg-glass-active"
                >
                  {Icon && (
                    <Icon className="mr-3 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="flex-1 text-[15px]">{p.label}</span>
                </button>
              );
            })}
          </BottomSheetBody>
        </BottomSheet>
      )}

      {/* The opened panel itself */}
      <BottomSheet
        open={Boolean(openPanel)}
        onOpenChange={(next) => !next && setOpenPanelId(null)}
        title={openPanel?.label ?? "Panel"}
      >
        <BottomSheetHeader
          title={openPanel?.label ?? ""}
          trailing={
            <button
              onClick={() => setOpenPanelId(null)}
              className="min-h-[44px] px-1 text-[15px] text-primary active:opacity-70"
            >
              Done
            </button>
          }
        />
        <BottomSheetBody>
          <div className="max-h-[70dvh] overflow-auto">
            {panels
              ?.filter((p) => p.alwaysMount || everOpened.has(p.id))
              .map((p) => (
                <div key={p.id} className={cn(p.id !== openPanelId && "hidden")}>
                  {p.content}
                </div>
              ))}
          </div>
        </BottomSheetBody>
      </BottomSheet>
    </>
  );
}
