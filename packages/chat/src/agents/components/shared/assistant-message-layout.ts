/**
 * The canonical reading width for assistant messages and any surface that
 * renders the same rich-document content outside chat. Keep the complete
 * centering contract here so those surfaces cannot drift by one breakpoint.
 */
export const ASSISTANT_MESSAGE_COLUMN_CLASS = "mx-auto w-full max-w-3xl";

/** Chat's exact horizontal inset inside the canonical reading column. */
export const ASSISTANT_MESSAGE_COLUMN_INSET_CLASS = "px-2";
