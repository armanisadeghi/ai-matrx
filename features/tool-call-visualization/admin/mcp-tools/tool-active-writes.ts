// Tool catalog Active writes (GATES-TAIL-2): each throws a refusal the screen can say in words
// (`describeWriteFailure` / `toastWriteFailure`); a write that changed no row is a refusal too.
import { supabase } from "@/utils/supabase/client";
import { assertWriteLanded, serverMessageFromBody, WriteRefusedError } from "@/lib/errors/writeFailure";

/** One tool's Active flag, through the admin tool route. */
export async function putToolActive(toolId: string, isActive: boolean): Promise<void> {
  const path = `/api/admin/tools/${toolId}`;
  const response = await fetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_active: isActive }),
  });
  if (response.ok) return;
  const body = await response.json().catch(() => null);
  const said =
    serverMessageFromBody(body) ??
    (body && typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : null);
  throw new WriteRefusedError({
    status: response.status,
    serverMessage: said,
    technical: `PUT ${path} ${response.status} ${JSON.stringify(body)}`,
  });
}

/** Many tools' Active flag at once, direct under RLS. */
export async function setToolsActive(ids: string[], active: boolean): Promise<void> {
  const { data, error } = await supabase
    .schema("tool")
    .from("definition")
    .update({ is_active: active })
    .in("id", ids)
    .select("id");
  if (error) throw error;
  assertWriteLanded(data, `tool.definition bulk is_active=${active} (${ids.length} ids)`);
}
