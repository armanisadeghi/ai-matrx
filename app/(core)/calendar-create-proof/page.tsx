"use client";
import { useRef, useState } from "react";
import { CalendarCreateReview, type CalendarCreateTransport } from "@/features/google-workspace/calendar/CalendarCreateReview";
import type { CalendarCreateIntent, CalendarCreateRequest } from "@/features/google-workspace/calendar/calendarCreateService";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId, selectUserEmail } from "@/lib/redux/selectors/userSelectors";
import { BackendApiError } from "@/lib/api/errors";
export default function Proof() {
 const actorId = useAppSelector(selectUserId);
 const email = useAppSelector(selectUserEmail);
 const [mode,setMode] = useState("success");
 const [role,setRole] = useState("owner");
 const [scope,setScope] = useState("one");
 const [calls,setCalls] = useState<string[]>([]);
 const intent = useRef<CalendarCreateIntent | null>(null);
 const transport: CalendarCreateTransport = {
  async preview(request: CalendarCreateRequest) {
   setCalls(v => [...v, `preview ${request.event_id}`]);
   if(mode === "preview-failure") throw new Error("Simulated review transport failure; no event was sent");
   const result: CalendarCreateIntent = {
    intent_id:"proof-intent", expires_at:new Date(Date.now()+(mode === "expired" ? -1000 : 300000)).toISOString(),
    preview: {account_email:"calendar-proof@example.com", calendar_id:request.calendar_id,calendar_summary:"Harmless Calendar",access_role:"owner",event_id:request.event_id,summary:request.summary,description:request.description,starts_at:request.starts_at,ends_at:request.ends_at,attendees:request.attendees ?? [],send_updates:request.send_updates,guest_notification_behavior:"No guest notifications are sent in this simulated proof.",undo_notice:"Guest notifications cannot be unsent."}
   };
   intent.current=result;
   return result;
  },
  async confirm({intentId}) {
   setCalls(v => [...v, `confirm ${intentId}`]);
   if(mode === "server-expired") throw new BackendApiError({detail:"Review expired",userMessage:"Review expired",code:"calendar_create_preview_expired",status:409});
   if(mode === "uncertain") throw new Error("Simulated interrupted provider response");
   if(mode === "unsent") throw new BackendApiError({detail:"Nothing was sent",userMessage:"Nothing was sent",code:"calendar_create_unavailable",status:503});
   if(!intent.current) throw new Error("No review");
   return {intent_id:intentId,result:{...intent.current.preview,provider_event_id:intent.current.preview.event_id,provider_etag:'"proof-v1"',reconciled_after_uncertain_insert:false}};
  }
 };
 if(email !== "admin@admin.com" || !actorId) return <main>Test identity: {email ?? "signed out"}</main>;
 return <main className="mx-auto max-w-xl p-4 space-y-3"><h1>Simulated Google Calendar — no provider or database operations</h1><p>Test identity: {email}</p>
 <button onClick={()=>{sessionStorage.removeItem("matrx.google-calendar.create-recovery.v1"); location.reload();}}>Reset simulated recovery</button><label>Result <select value={mode} onChange={e=>setMode(e.target.value)}><option value="success">Success</option><option value="uncertain">Uncertain</option><option value="unsent">Known unsent</option><option value="preview-failure">Preview failure</option><option value="expired">Expired review</option><option value="server-expired">Server expired review</option></select></label>
 <label>Calendar role <select value={role} onChange={e=>setRole(e.target.value)}><option value="owner">Owner</option><option value="reader">Reader</option></select></label>
 <button onClick={()=>setScope(v=>v === "one" ? "two":"one")}>Change account</button>
 <CalendarCreateReview actorId={actorId} organizationId="proof-org" connectionId={`proof-${scope}`} accountLabel={scope === "one" ? "calendar-proof@example.com":"other-proof@example.com"} calendar={{id:`calendar-${scope}`,summary:"Harmless Calendar",access_role:role,primary:false,time_zone:"America/Los_Angeles"}} transport={transport}/>
 <pre aria-label="Simulated calls">{calls.join("\n") || "No simulated calls"}</pre></main>;
}
