import { isTransportFailure } from "@/lib/net/errors";

export interface TranscriptionErrorPolicyInput {
  errorCode: string;
  errorMessage: string;
}

export function shouldPersistTranscriptionError(
  error: TranscriptionErrorPolicyInput,
): boolean {
  return !(
    error.errorCode === "CHUNK_FAILED" &&
    isTransportFailure({ message: error.errorMessage })
  );
}
