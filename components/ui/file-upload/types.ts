import { EnhancedFileDetails } from "@/utils/file-operations/constants";

export type UploadedFileResult = {
  /** cld_files UUID — set whenever the upload landed in cloud-files. */
  fileId?: string;
  url: string;
  type: string;
  details?: EnhancedFileDetails;
};
