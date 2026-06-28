// Canonical shared UI variant type. Previously re-exported from the (now-deleted)
// ArmaniForm entity-form system; defined here so the UI primitives don't depend
// on the retired entity code.
export type MatrxVariant =
  | "default"
  | "destructive"
  | "success"
  | "outline"
  | "secondary"
  | "ghost"
  | "link"
  | "primary";
