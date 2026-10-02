"use client";

/**
 * The click side of `referenceDoor` — THE one way a reference chip, a
 * directive's record link and an authored picker chip open what they name.
 *
 *   `open`    → the in-place window / Detail (`useOpenItemPresentation`)
 *   `address` → the registered peek when there is one (its own "Open" link
 *               reaches the route), else the route itself (`primaryHref` —
 *               render it as a link so open / new tab both work)
 *   `none`    → `canOpen` is false; render the name, never a dead button
 *
 * `newTabHref` is the route for every door that has one, so a chip can offer
 * "open in a new tab" beside the click.
 */

import { useState, type ReactNode } from "react";
import { useOpenItemPresentation } from "@/features/item-presentation/useOpenItemPresentation";
import { ResourcePeekHost } from "@/features/organizations/peek/ResourcePeekHost";
import { referenceDoor, type ReferenceDoor } from "@/features/matrx-envelope/referenceDoor";

export interface ReferenceDoorAction {
  door: ReferenceDoor;
  canOpen: boolean;
  /** Tooltip verb for the primary click. */
  title: string;
  /** Set when the primary click is the route itself — render a link to it. */
  primaryHref: string | null;
  /** The primary click for every other door. */
  activate: () => void;
  newTabHref: string | null;
  /** Mount beside the trigger; renders the peek dialog while open. */
  peek: ReactNode;
}

export function useReferenceDoor(
  type: string,
  ref: Record<string, string>,
  name: string,
): ReferenceDoorAction {
  const openItem = useOpenItemPresentation();
  const [peekOpen, setPeekOpen] = useState(false);
  const door = referenceDoor(type, ref);

  if (door.kind === "none") {
    return {
      door,
      canOpen: false,
      title: name,
      primaryHref: null,
      activate: () => {},
      newTabHref: null,
      peek: null,
    };
  }

  const viaPeek = door.kind === "address" && door.canPeek;
  const activate = () => {
    if (door.kind === "open") {
      openItem(door.itemType, door.id, { name });
    } else if (viaPeek) {
      setPeekOpen(true);
    }
  };

  return {
    door,
    canOpen: true,
    title: viaPeek ? `Quick look at ${name}` : `Open ${name}`,
    primaryHref: door.kind === "address" && !viaPeek ? door.href : null,
    activate,
    newTabHref: door.href,
    peek:
      viaPeek && peekOpen ? (
        <ResourcePeekHost
          kind={door.peekKind}
          id={door.id}
          onClose={() => setPeekOpen(false)}
        />
      ) : null,
  };
}
