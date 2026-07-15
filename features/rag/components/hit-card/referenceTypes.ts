export type RagReferenceKind =
  "document" | "clean" | "image" | "table" | "custom";

export interface RagReferenceAvailability {
  document: boolean;
  clean: boolean;
  image: boolean;
  table: boolean;
  custom: boolean;
}

export interface RagReferenceRequest {
  kind: RagReferenceKind;
  nonce: number;
}

export const EMPTY_RAG_REFERENCE_AVAILABILITY: RagReferenceAvailability = {
  document: false,
  clean: false,
  image: false,
  table: false,
  custom: false,
};
