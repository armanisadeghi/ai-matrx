import { redirect } from "next/navigation";

// The older list editors (v1, v2) and the v3 address of the Picklists page retired at
// OLD-READERS-REMOVAL (2026-10-01): every list lives in the record store; the Picklists page is /lists.
export default function RetiredPicklistsAddress(): never {
  redirect("/lists");
}
