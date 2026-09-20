// features/notifications/types.ts
//
// The shape the `communication` notification doors actually return, and the
// result envelope every door in `./service.ts` answers with.

/** One row of `communication.my_notifications`, mapped field by field. */
export interface PlatformNotification {
  id: string;
  eventKey: string;
  subject: string;
  body: string | null;
  deepLink: string | null;
  targetKind: string | null;
  targetId: string | null;
  organizationId: string | null;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  actedAt: string | null;
  outcome: string | null;
}

/**
 * Nothing in `./service.ts` throws and nothing swallows: a refusal comes back
 * as `{ok:false}` carrying the door's OWN sentence, which the bell renders
 * verbatim instead of an empty list.
 */
export type NotificationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string; code: string | null; technical: string | null };
