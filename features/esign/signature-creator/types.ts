// features/esign/signature-creator/types.ts — what a tab hands the dialog body.

export type CreatorTab = "typed" | "drawn" | "uploaded" | "phone" | "saved";

/** One ready-to-adopt mark: what the person is looking at in the preview. */
export interface Candidate {
  kind: "typed" | "drawn" | "uploaded";
  source: "this_device" | "phone" | "saved";
  /** The creator output (decision C) — absent for phone/saved, which the server already holds. */
  image_data_url?: string;
  typed_style?: string;
  handoff_id?: string;
  saved_signature_id?: string;
  /** Always set: a data URL the preview draws. */
  preview_url: string;
}
