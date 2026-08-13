import { EnhancedFileDetails } from "@/utils/file-operations/constants";

export type UploadedFileResult = {
  /** Canonical files.files UUID. Uploads without identity are rejected. */
  fileId: string;
  url: string;
  type: string;
  details?: EnhancedFileDetails;
};
