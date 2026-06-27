import type { MatrxRecordId } from "@/types/records";

/** Shared with layout + componentConfigTypes without importing layout UI modules. */
export interface UnifiedCrudHandlers {
  handleCreate?: (
    tempRecordId: MatrxRecordId,
    options?: { showToast?: boolean },
  ) => void;
  handleUpdate?: (options?: { showToast?: boolean }) => void;
  handleDelete?: (options?: { showToast?: boolean }) => void;
  handleFieldUpdate?: (fieldName: string, value: any) => void;
  handleFetchOne?: (
    matrxRecordId: MatrxRecordId,
    options?: { showToast?: boolean },
  ) => void;
  handleFetchOneWithFkIfk?: (
    matrxRecordId: MatrxRecordId,
    options?: { showToast?: boolean },
  ) => void;
}
