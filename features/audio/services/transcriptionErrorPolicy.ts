import { isTransportFailure } from "@/lib/net/errors";

export interface TranscriptionErrorPolicyInput {
  errorCode: string;
  errorMessage: string;
}

export function shouldPersistTranscriptionError(
  error: TranscriptionErrorPolicyInput,
): boolean {
  const isLiveChunkTimeout =
    error.errorCode === "CHUNK_FAILED" &&
    error.errorMessage === "The request timed out — please retry.";

  return !(
    error.errorCode === "CHUNK_FAILED" &&
    (isTransportFailure({ message: error.errorMessage }) || isLiveChunkTimeout)
  );
}
