"use client";
import { useState } from "react";
import { MeetReviewBody } from "@/features/google-workspace/meet/MeetReview";
import type { MeetReviewService } from "@/features/google-workspace/meet/service";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";
const fixture = (id:string):GoogleConnectionSummary => ({id,owner_type:"user",owner_user_id:"fixture-admin",organization_id:null,provider:"google",provider_subject:id,account_email:`${id}@example.com`,account_name:null,scopes:[GOOGLE_SCOPE.meetingsSpaceReadonly],status:"connected",last_verified_at:null,last_error:null,created_at:"2026-10-01T00:00:00Z",updated_at:"2026-10-01T00:00:00Z",metadata:{},credential_present:true,credential_stable:true,health:"connected",capability_health:{}});
const parent="conferenceRecords/atlas";
const transcript=`${parent}/transcripts/notes`;
export default function Proof(){
 const [fail,setFail]=useState(false);const [granted,setGranted]=useState(true);const [calls,setCalls]=useState<string[]>([]);
 const service:MeetReviewService={
  async previewConferences(request,org){setCalls(c=>[...c,`Conferences ${request.connection_id} ${org} ${request.page_token??"first"}`]);if(fail)throw new Error("Simulated provider unavailable");return {access_mode:"internal_test_read_only",conferences:[{name:parent,space_name:"spaces/Project-Atlas",start_time:"2026-10-01T09:00:00Z",end_time:"2026-10-01T09:30:00Z",transcripts:{state:"available",names:[transcript]},recordings:{state:"none",names:[]}}],next_page_token:request.page_token?null:"next-conferences"};},
  async previewTranscriptEntries(request,org){setCalls(c=>[...c,`Entries ${request.connection_id} ${org} ${request.page_token??"first"}`]);if(fail)throw new Error("Simulated provider unavailable");return {access_mode:"internal_test_read_only",conference_record_name:request.conference_record_name,transcript_name:request.transcript_name,entries:[{name:`${transcript}/entries/${request.page_token?"two":"one"}`,start_time:"2026-10-01T09:01:00Z",end_time:"2026-10-01T09:02:00Z",text:request.page_token?"Follow-up: confirm the project timeline.":"Project Atlas: the reviewer selected this harmless transcript. <script>literal text only</script>"}],next_page_token:request.page_token?null:"next-entries"};}
 };
 return <main className="p-3"><h1 className="text-lg">Meet local interaction proof</h1><p>SIMULATED Meet transport. No real Google or account records used.</p><div className="flex gap-3 py-2"><button onClick={()=>setFail(!fail)}>Provider failure: {fail?"on":"off"}</button><button onClick={()=>setGranted(!granted)}>Fixture grant: {granted?"on":"off"}</button></div><div className="flex h-[620px] w-full max-w-[520px] min-h-0 flex-col overflow-hidden rounded border"><MeetReviewBody context={{organizationId:"fixture-org",actorId:"fixture-admin",connections:granted?[fixture("review-one"),fixture("review-two")]:[]}} service={service}/></div><output className="block whitespace-pre-wrap">{calls.join("\n")}</output></main>;
}
