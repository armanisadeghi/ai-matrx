import { v4 as uuidv4 } from "uuid";

export type DataWithOptionalId = { id?: string; [key: string]: unknown };
export type DataWithId = { id: string; [key: string]: unknown };

/** Ensures every record (or each item in an array) has a string `id`. */
export function ensureId<T extends DataWithOptionalId | DataWithOptionalId[]>(
  input: T,
): T extends DataWithOptionalId[] ? DataWithId[] : DataWithId {
  if (Array.isArray(input)) {
    return input.map((item) => ({
      ...item,
      id: item.id ?? uuidv4(),
    })) as T extends DataWithOptionalId[] ? DataWithId[] : DataWithId;
  }

  if ("id" in input && typeof input.id === "string") {
    return input as T extends DataWithOptionalId[] ? DataWithId[] : DataWithId;
  }

  return { ...input, id: uuidv4() } as T extends DataWithOptionalId[]
    ? DataWithId[]
    : DataWithId;
}
