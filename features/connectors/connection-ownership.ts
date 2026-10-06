// features/connectors/connection-ownership.ts
//
// WHOSE IS THIS CONNECTED ACCOUNT, FROM WHERE THE VIEWER STANDS — the ONE
// answer every connections surface reads.
//
// Row security is the ceiling, never the view (CLAUDE.md § Security canon).
// `users.integration_connections` lets a person read their own accounts AND
// every account an organization they belong to connected — and lets a platform
// admin read everyone's. A page that lists "your" connections straight off that
// read paints an organization's credential as the person's own: Arman
// (2026-10-05) saw AI Matrx's shared Google account — the one Search Console
// runs on — listed as his personal Google, with no offer to connect his own, and
// a Disconnect that would have cut the whole organization off.
//
//   mine         — a personal account this person connected. Theirs to manage.
//   organization — an organization they belong to connected it. They USE it;
//                  managing it is an organization act, never a personal one.
//   someone_else — another person's personal account (only a platform admin's
//                  row security reaches these). Never shown as anyone's own.

export type ConnectionOwnership = "mine" | "organization" | "someone_else";

export interface OwnedConnection {
  ownerKind: "person" | "organization";
  /** Absent: the adapter's read already returns only the viewer's own personal rows. */
  ownerUserId?: string | null;
  organizationId: string | null;
}

export interface ConnectionViewer {
  userId: string | null;
  /** The viewer's memberships; null while the organization tree has not loaded. */
  organizationIds: ReadonlySet<string> | null;
}

export function connectionOwnership(
  connection: OwnedConnection,
  viewer: ConnectionViewer,
): ConnectionOwnership {
  if (connection.ownerKind === "person") {
    if (connection.ownerUserId === undefined) return "mine";
    return viewer.userId !== null && connection.ownerUserId === viewer.userId
      ? "mine"
      : "someone_else";
  }
  // Before the tree answers, an organization's account is still shown as
  // shared — never as the viewer's own, and never silently dropped.
  if (!viewer.organizationIds) return "organization";
  return connection.organizationId !== null &&
    viewer.organizationIds.has(connection.organizationId)
    ? "organization"
    : "someone_else";
}

/** Split a list into the person's own accounts and the ones their organizations share. */
export function splitConnectionsByOwnership<T extends OwnedConnection>(
  connections: readonly T[],
  viewer: ConnectionViewer,
): { mine: T[]; shared: T[] } {
  const mine: T[] = [];
  const shared: T[] = [];
  for (const connection of connections) {
    const ownership = connectionOwnership(connection, viewer);
    if (ownership === "mine") mine.push(connection);
    else if (ownership === "organization") shared.push(connection);
  }
  return { mine, shared };
}
