import { postJson } from "@/lib/python-client";

export type GoogleEmbeddingPart =
  | { type: "text"; text: string }
  | { type: "uri"; uri: string; mime_type?: string };

export interface GoogleEmbeddingRequest {
  model: "gemini-embedding-2" | "gemini-embedding-001";
  inputs: Array<string | GoogleEmbeddingPart[]>;
  output_dimensionality: number;
  task_type?: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY";
  title?: string;
}

export interface GoogleEmbeddingResponse {
  model: string;
  dimensions: number;
  vectors: number[][];
}

export async function createGoogleEmbeddings(
  body: GoogleEmbeddingRequest,
  signal?: AbortSignal,
): Promise<GoogleEmbeddingResponse> {
  const { data } = await postJson<
    GoogleEmbeddingResponse,
    GoogleEmbeddingRequest
  >("/ai/google/embeddings", body, { signal });
  return data;
}
