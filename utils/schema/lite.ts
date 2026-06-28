import { v4 as uuidv4 } from "uuid";

type WithOptionalId = { id?: string };
type WithId = { id: string };

/** Ensures every record (or each item in an array) has a string `id`. */
export function ensureId<T extends WithOptionalId>(input: T[]): Array<T & WithId>;
export function ensureId<T extends WithOptionalId>(input: T): T & WithId;
export function ensureId<T extends WithOptionalId>(
  input: T | T[],
): (T & WithId) | Array<T & WithId> {
  if (Array.isArray(input)) {
    return input.map((item) => ({
      ...item,
      id: item.id ?? uuidv4(),
    }));
  }

  if (typeof input.id === "string") {
    return input as T & WithId;
  }

  return { ...input, id: uuidv4() };
}

/** @deprecated Use ensureId — kept for existing imports. */
export type DataWithOptionalId = WithOptionalId & Record<string, unknown>;
/** @deprecated Use ensureId return type — kept for existing imports. */
export type DataWithId = WithId & Record<string, unknown>;
