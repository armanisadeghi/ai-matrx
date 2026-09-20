import {
  createStorageSourcePickerCallbackGroup,
  deliverStorageSourceImports,
} from "@/features/overlays/callbacks/storageSourcePicker";
import type { CanonicalStorageImport } from "@/features/files/storage-sources/types";

const imported = { fileId: "file-1" } as CanonicalStorageImport;

test("delivery stays available across intermediate acknowledgements", async () => {
  const onImported = jest.fn().mockResolvedValue(undefined);
  const group = createStorageSourcePickerCallbackGroup({ onImported });
  await deliverStorageSourceImports(group.callbackGroupId, [imported]);
  await deliverStorageSourceImports(group.callbackGroupId, [imported]);
  expect(onImported).toHaveBeenCalledTimes(2);
  group.dispose();
});

test("a rejected consumer delivery remains retryable without re-import", async () => {
  const onImported = jest
    .fn()
    .mockRejectedValueOnce(new Error("conversation write failed"))
    .mockResolvedValueOnce(undefined);
  const group = createStorageSourcePickerCallbackGroup({ onImported });
  await expect(
    deliverStorageSourceImports(group.callbackGroupId, [imported]),
  ).rejects.toThrow("conversation write failed");
  await expect(
    deliverStorageSourceImports(group.callbackGroupId, [imported]),
  ).resolves.toBeUndefined();
  expect(onImported).toHaveBeenCalledTimes(2);
  group.dispose();
});
