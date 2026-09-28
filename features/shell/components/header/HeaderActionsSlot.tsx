"use client";

/**
 * HeaderActionsSlot — THE SHEET CONTRACT for a header row that cannot move
 * onto `RouteHeader` (an inline-rename title, a room header with its own
 * layout). Wrap the row's ACTIONS in it:
 *
 *   <PageHeader>
 *     <div className="flex …">
 *       <Title />
 *       <HeaderActionsSlot>{…the row's buttons…}</HeaderActionsSlot>
 *     </div>
 *   </PageHeader>
 *
 * On desktop the children render right where they are. On a phone (below
 * 768px, with the shell's ⋮ mounted) they PORTAL into the ⋮ sheet's "This
 * page" section, one named row per control, exactly like `RouteHeader`'s
 * actions — so every phone header carries one overflow and the title keeps the
 * row (page-pass shared defects, 2026-09-27). They stay mounted in the page's
 * own tree either way. `pnpm check:bespoke-headers` accepts controls inside it.
 */

import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { setPhonePageActionCount, usePhonePageActions } from "./phone-page-actions";
import { PhoneSheetAction } from "./RouteHeader";
import { flattenActions } from "./route-header-layout";

export function HeaderActionsSlot({
  children,
  className,
}: {
  children: ReactNode;
  /** Classes for the in-row wrapper on desktop. */
  className?: string;
}) {
  const isPhone = useIsMobile();
  const { host } = usePhonePageActions();
  const actions = flattenActions(children).filter((a) => !a.inert);
  const toSheet = isPhone && host != null && actions.length > 0;
  const owner = useId();
  useEffect(() => {
    setPhonePageActionCount(owner, toSheet ? actions.length : 0);
    return () => setPhonePageActionCount(owner, 0);
  }, [owner, toSheet, actions.length]);

  if (toSheet && host) {
    return createPortal(
      <div data-header-actions-slot-phone className="flex flex-col gap-0.5">
        {actions.map((a) => (
          <PhoneSheetAction key={a.key} action={a} />
        ))}
      </div>,
      host,
    );
  }
  // `data-header-actions-slot`: on a phone these go to the ⋮ sheet once the
  // client knows it is a phone; the server cannot, so the pre-hydration
  // header hides them by CSS from the first paint (styles/shell.css).
  return (
    <div data-header-actions-slot className={className ?? "flex shrink-0 items-center"}>
      {children}
    </div>
  );
}

export default HeaderActionsSlot;
