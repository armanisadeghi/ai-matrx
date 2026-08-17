export interface SlotKeyParts {
  /** The feature/domain namespace before the first dot. */
  feature: string;
  /** The complete step name after the first dot; later dots are preserved. */
  slot: string;
}

/** Split canonical `<feature>.<slot>` identity without losing information. */
export function splitSlotKey(slotKey: string): SlotKeyParts {
  const separator = slotKey.indexOf(".");
  if (separator <= 0 || separator === slotKey.length - 1) {
    return { feature: "(unscoped)", slot: slotKey };
  }
  return {
    feature: slotKey.slice(0, separator),
    slot: slotKey.slice(separator + 1),
  };
}
