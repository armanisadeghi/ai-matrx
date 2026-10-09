/**
 * Archive from the /transcripts list leaves the row where the Archived filter says it belongs.
 *
 * 2026-09-30: under "Active + archived" the archived row vanished from the list (it was removed
 * as if the view were "Active only"), though it is still part of that view — now marked archived.
 */

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({ confirm: jest.fn(async () => true) }));
jest.mock("@/features/trash/service", () => ({
  archiveRecord: jest.fn(async () => undefined),
  restoreFromTrash: jest.fn(async () => undefined),
}));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/features/matrx-envelope/recordReference", () => ({ buildRecordReferenceFence: jest.fn() }));

import type { EntityListController } from "@/lib/entity-list/config";
import type { ItemMenuEntry } from "@ai-matrx/chat/ui/item-types";
import { archiveRecord } from "@/features/trash/service";
import { useTranscriptRowActions } from "./useTranscriptRowActions";
import type { TranscriptListRow } from "./types";

const row = { id: "t-1", kind: "transcript", title: "Tragedy of the commons", is_archived: false } as TranscriptListRow;

function controller(archived: "active" | "archived" | "all") {
  return {
    query: { archived },
    removeRow: jest.fn(),
    refresh: jest.fn(),
  } as unknown as EntityListController<TranscriptListRow> & { removeRow: jest.Mock; refresh: jest.Mock };
}

async function archiveThrough(list: ReturnType<typeof controller>) {
  const { actions } = useTranscriptRowActions(list);
  const menu = actions.menuFor!(row)();
  const item = menu.sections.flatMap((s) => s.items as ItemMenuEntry[]).find((i) => i.id === "archive");
  expect(item).toBeDefined();
  (item as { onSelect: () => void }).onSelect();
  await new Promise((r) => setTimeout(r, 0));
  expect(archiveRecord).toHaveBeenCalledWith("transcript", "t-1", "transcript");
}

it("under Active only, the archived row leaves the list", async () => {
  const list = controller("active");
  await archiveThrough(list);
  expect(list.removeRow).toHaveBeenCalledWith("t-1");
  expect(list.refresh).not.toHaveBeenCalled();
});

it("under Active + archived, the row stays and the list re-reads it as archived", async () => {
  const list = controller("all");
  await archiveThrough(list);
  expect(list.removeRow).not.toHaveBeenCalled();
  expect(list.refresh).toHaveBeenCalled();
});
