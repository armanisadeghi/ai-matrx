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
 *
 * A record IN THE TRASH (`trashed`) opens none of those — the window's read
 * hides a trashed row and said "We couldn't open this task…" (G6A review,
 * 2026-10-02). Its click opens the trash door instead: Restore, or the way out
 * (`ReferenceTrashDoor`). Every chip shows `trashed` up front.
 */

import { useState, type ReactNode } from "react";
import { useOpenItemPresentation } from "@/features/item-presentation/useOpenItemPresentation";
import { ResourcePeekHost } from "@/features/organizations/peek/ResourcePeekHost";
import { referenceDoor, type ReferenceDoor } from "@/features/matrx-envelope/referenceDoor";
import { useReferenceTrashed } from "@/features/matrx-envelope/referenceTrash";
import { ReferenceTrashDoor } from "@/features/matrx-envelope/components/ReferenceTrashDoor";
import { TRASH_HREF } from "@/features/trash/archiveCopy";

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
  /** The record is in the trash — the chip says so, and the click is the trash door. */
  trashed: boolean;
}

export function useReferenceDoor(
  type: string,
  ref: Record<string, string>,
  name: string,
): ReferenceDoorAction {
  const openItem = useOpenItemPresentation();
  const [peekOpen, setPeekOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const door = referenceDoor(type, ref);
  const trashed = useReferenceTrashed(type, ref) === true;

  if (door.kind === "none") {
    return {
      door,
      canOpen: false,
      title: name,
      primaryHref: null,
      activate: () => {},
      newTabHref: null,
      peek: null,
      trashed,
    };
  }

  if (trashed) {
    const token = door.token;
    return {
      door,
      canOpen: true,
      title: `${name} is in the trash`,
      // No token to restore by → Trash itself, where it is listed.
      primaryHref: token ? null : TRASH_HREF,
      activate: () => setTrashOpen(true),
      newTabHref: null,
      peek:
        token && trashOpen ? (
          <ReferenceTrashDoor token={token} id={door.id} name={name} onClose={() => setTrashOpen(false)} />
        ) : null,
      trashed,
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
    trashed,
  };
}
