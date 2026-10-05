// features/unified-data/table-page/recordPageHref.ts — THE ONE ADDRESS OF A RECORD'S OWN PAGE.
//
// Every record the UI names opens (no-dead-ends): the grid's ⤢, a card's Open / Open in new tab /
// Copy link, the peek's Open — all reach `/data/<table>/r/<record>` through records-ui's
// `hrefForRecord` port, bound once in `recordsUiHostFor`.

export function recordPageHref(tableId: string, recordId: string): string {
  return `/data/${encodeURIComponent(tableId)}/r/${encodeURIComponent(recordId)}`;
}
