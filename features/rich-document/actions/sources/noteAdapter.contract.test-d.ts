import type { NoteSaveReceipt } from "@/features/notes/service/noteSaveErrors";
import type { NotesContentSourceAdapter } from "./note";
declare const adapter: NotesContentSourceAdapter;
declare const result: ReturnType<NotesContentSourceAdapter["edit"]>;
const receipt: Promise<NoteSaveReceipt> = result;
void receipt;
// @ts-expect-error Notes adapters cannot regress to a void acknowledgement.
const discarded: Promise<void> = result;
void discarded;
void adapter;
