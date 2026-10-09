/**
 * DUPLICATING A TILE (⌘D / the selection toolbar's Duplicate) — what a copy is, per kind of content.
 *
 * A board holds each record ONCE (`recordKeyOf`: two tiles of one note are two editors of one record,
 * the later save silently wins), so a duplicate never places a second tile of the same record. The
 * ruling (FigJam / Miro duplicate the object; a record is not the board's object to duplicate):
 *
 *   board-only content (write-up text, web page address, image by address)   COPIED — a new tile, same content
 *   chat, agent form                                                          COPIED — a fresh conversation, same agent
 *   note, document                                                            COPIED through the feature's own copy
 *                                                                             action (`copyNote` / `copyDocument`),
 *                                                                             the same services a template use runs
 *   every other record (file, table row, task, meeting, project, ...)        NOT copied: null -> "Already on this board"
 *
 * A record joins the "copied" list only when its feature has a copy action; add it here then.
 */

import type { NodeSource } from "../board/document";
import { defaultCloneServices, type CloneServices } from "../templates/clone-content";

export interface TileCopy {
  title: string;
  source: NodeSource;
}

/** The content for a duplicate of this tile, or null when it has none (a shared record). */
export async function copyTileContent(
  tile: { title: string; source: NodeSource },
  services: CloneServices = defaultCloneServices,
): Promise<TileCopy | null> {
  const { source, title } = tile;
  switch (source.kind) {
    case "text":
    case "html":
      return { title, source };
    case "image":
      return source.url && !source.fileId ? { title, source } : null;
    case "document": {
      if (!source.documentId) return null;
      const copy = await services.copyDocument(source.documentId);
      return { title: copy.name ?? title, source: { kind: "document", documentId: copy.id } };
    }
    case "entity": {
      if (source.entity === "chat" || source.entity === "agent-form") return { title, source: { ...source, id: null } };
      if (!source.id) return null;
      if (source.entity === "note") {
        const copy = await services.copyNote(source.id);
        return { title: copy.label ?? title, source: { ...source, id: copy.id } };
      }
      if (source.entity === "udt_document") {
        const copy = await services.copyDocument(source.id);
        return { title: copy.name ?? title, source: { ...source, id: copy.id } };
      }
      return null;
    }
    default:
      return null;
  }
}
