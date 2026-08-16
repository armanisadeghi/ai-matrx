"use client";

/**
 * features/hindsight/components/door-audience.tsx
 *
 * One surface, two audiences. The admin console opens records through
 * /administration/* doors; the product surface (a user's own agent's Hindsight
 * tab) opens the same records through product routes the user can actually
 * reach. Components read the audience from context so the tree renders the
 * right doors without threading a prop through every card.
 */
import { createContext, useContext } from "react";

import type { DoorAudience } from "../subject-doors";

const DoorAudienceContext = createContext<DoorAudience>("admin");

export function DoorAudienceProvider({
  audience,
  children,
}: {
  audience: DoorAudience;
  children: React.ReactNode;
}) {
  return (
    <DoorAudienceContext.Provider value={audience}>
      {children}
    </DoorAudienceContext.Provider>
  );
}

export function useDoorAudience(): DoorAudience {
  return useContext(DoorAudienceContext);
}
