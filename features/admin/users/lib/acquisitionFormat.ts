/** A timestamp as the acquisition screens show it; `—` when there is none. */
export function fmtAcquisitionDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}
