"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { loadPinterestData, pinterestRequest, type PinterestData } from "./pinterest-service";

export function PinterestDataPanel({organizationId, connectionId, selectionVersion}: {organizationId: string; connectionId: string; selectionVersion: unknown}) {
  const [data, setData] = useState<PinterestData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadPinterestData(organizationId, connectionId).then((value) => {if (!cancelled) {setData(value); setError(null);}})
      .catch((failure) => {if (!cancelled) setError(failure instanceof Error ? failure.message : "Pinterest data could not be loaded.");});
    return () => {cancelled = true;};
  }, [organizationId, connectionId, selectionVersion]);
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!data) return null;
  const total = (field: "engagements" | "impressions" | "saves" | "outbound_clicks" | "pin_clicks") => data.analytics.some((day) => day[field] !== null) ? data.analytics.reduce((sum, day) => sum + (day[field] ?? 0), 0).toLocaleString() : "—";
  return <div className="space-y-2 rounded-md border p-3" aria-label="Pinterest data">
    <div className="flex items-center justify-between"><span className="font-medium">Pinterest data{!data.connected && " · Disconnected"}</span><Button variant="quiet" disabled={busy || !data.connected} onClick={async () => {
      setBusy(true); try {setData(await pinterestRequest("sync", organizationId, {resource_id: data.resource_id})); setError(null);} catch (failure) {toast.error(failure instanceof Error ? failure.message : "Pinterest sync failed.");} finally {setBusy(false);}
    }}>Sync</Button></div>
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground"><span>{data.boards?.length ?? 0} boards</span><span>{data.pins?.length ?? 0} pins</span><span>{data.last_sync_at ? `Updated ${new Date(data.last_sync_at).toLocaleString()}` : "No saved data"}</span></div>
    <div className="grid grid-cols-2 gap-2 text-sm"><span>Engagements · {total("engagements")}</span><span>Impressions · {total("impressions")}</span><span>Saves · {total("saves")}</span><span>Pin clicks · {total("pin_clicks")}</span><span>Outbound clicks · {total("outbound_clicks")}</span></div>
    <p className="text-xs text-muted-foreground">{data.start_date} – {data.end_date}</p>
    {!!data.boards?.length && <ul className="space-y-1 text-sm" aria-label="Pinterest boards">{data.boards.map((board) => <li key={board.id}>{board.name ?? board.id} · {board.privacy ?? "—"} · {board.pin_count ?? "—"} pins</li>)}</ul>}
    {!!data.pin_analytics && <ul className="space-y-1 text-sm" aria-label="Pinterest pin analytics">{Object.entries(data.pin_analytics).map(([id, insight]) => { const summary = insight.metrics.all?.summary_metrics ?? insight.metrics.ALL?.summary_metrics; return <li key={id}>Pin {id} · Impressions {summary?.IMPRESSION?.toLocaleString() ?? "—"} · Saves {summary?.SAVE?.toLocaleString() ?? "—"}</li>; })}</ul>}
    {!data.connected && <a className="text-xs underline" href="https://www.pinterest.com/settings/security" target="_blank" rel="noreferrer">Remove AI Matrx in Pinterest</a>}
    {!!data.pins?.length && <ul className="space-y-1 text-sm" aria-label="Pinterest pins">{data.pins.map((pin) => <li key={pin.id}><a className="underline" href={`https://www.pinterest.com/pin/${encodeURIComponent(pin.id)}/`} target="_blank" rel="noreferrer">{pin.title ?? pin.description ?? pin.id}</a></li>)}</ul>}
  </div>;
}
