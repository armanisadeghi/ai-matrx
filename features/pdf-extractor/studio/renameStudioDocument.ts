/**
 * renameStudioDocument — keep `processed_documents.name` and the backing
 * `cld_files` row in lock-step. The studio sidebar, toolbar title, and
 * `/files` route should always show the same name.
 */

import type { AppDispatch } from "@/lib/redux/store";
import { renameFile } from "@/features/files/redux/thunks";
import { supabase } from "@/utils/supabase/client";
import { docprocDb } from "@/utils/supabase/docprocDb";

export interface RenameStudioDocumentInput {
  docId: string;
  sourceKind: string | null;
  sourceId: string | null;
  newName: string;
  dispatch: AppDispatch;
}

export async function renameStudioDocument(
  input: RenameStudioDocumentInput,
): Promise<void> {
  const trimmed = input.newName.trim();
  if (!trimmed) return;

  const { error } = await docprocDb(supabase)
    .from("processed_documents")
    .update({ name: trimmed })
    .eq("id", input.docId);
  if (error) throw new Error(error.message);

  if (input.sourceKind === "cld_file" && input.sourceId) {
    await input
      .dispatch(renameFile({ fileId: input.sourceId, newName: trimmed }))
      .unwrap()
      .catch(() => undefined);
  }
}
