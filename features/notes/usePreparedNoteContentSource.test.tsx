import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Note } from "./types";
import { createBlankNoteRecord } from "./redux/notes.types";
import { usePreparedNoteContentSource } from "./usePreparedNoteContentSource";
const id="33333333-3333-4333-8333-333333333333", org="11111111-1111-4111-8111-111111111111", actor="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const note=(o:Partial<Note>={}):Note=>({id,organization_id:org,version:0,content:"same",label:"N",folder_name:null,folder_id:null,tags:[],metadata:{},visibility:"personal",position:0,project_id:null,task_id:null,created_at:"",created_by:actor,updated_at:"",updated_by:actor,deleted_at:null,content_hash:null,file_path:null,last_device_id:null,sync_version:0,...o});
it("keeps an identical render stable and changes opaque snapshot identity for equal-length or metadata changes", async()=>{
 let latest=""; const root=createRoot(document.createElement("div"));
 (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT=true;
 function Probe({displayed}:{displayed:Note}) { const source=usePreparedNoteContentSource({record:createBlankNoteRecord(note()),displayedNote:displayed,actorId:actor}); latest=source?.type === "note" && source.mode === "editable" ? source.snapshotId : ""; return null; }
 await act(async()=>root.render(<Probe displayed={note()}/>)); const first=latest;
 await act(async()=>root.render(<Probe displayed={note()}/>)); const same=latest;
 await act(async()=>root.render(<Probe displayed={note({content:"diff"})}/>)); const equalLength=latest;
 await act(async()=>root.render(<Probe displayed={note({content:"diff",metadata:{changed:true}})}/>)); const metadata=latest;
 expect(first).toBe(same); expect(equalLength).not.toBe(same); expect(metadata).not.toBe(equalLength); expect([first,same,equalLength,metadata].every(v=>!v.includes("diff")&&!v.includes("same"))).toBe(true); await act(async()=>root.unmount());
});

it("keeps mounted editors separate and advances for note, actor, base, and selection changes", async()=>{
 let left="",right=""; const root=createRoot(document.createElement("div"));
 function Probe({slot,displayed,actorId,selection}:{slot:"left"|"right";displayed:Note;actorId:string;selection?:string}) { const source=usePreparedNoteContentSource({record:createBlankNoteRecord(note({id:displayed.id,organization_id:displayed.organization_id,version:displayed.version})),displayedNote:displayed,actorId, ...(selection===undefined?{}:{actingSelection:selection})}); if(slot==="left") left=source?.type === "note" && source.mode === "editable" ? source.snapshotId : ""; else right=source?.type === "note" && source.mode === "editable" ? source.snapshotId : ""; return null; }
 const render=async(displayed:Note,actorId=actor,selection?:string)=>act(async()=>root.render(<><Probe slot="left" displayed={displayed} actorId={actorId} selection={selection}/><Probe slot="right" displayed={displayed} actorId={actor} /></>));
 await render(note()); const initialLeft=left,initialRight=right; expect(initialLeft).not.toBe(initialRight);
 await render(note({id:"44444444-4444-4444-8444-444444444444"})); expect(left).not.toBe(initialLeft);
 const switched=left; await render(note({id:"44444444-4444-4444-8444-444444444444"}),"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"); expect(left).not.toBe(switched);
 const actorChanged=left; await render(note({id:"44444444-4444-4444-8444-444444444444",version:1}),"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","selection"); expect(left).not.toBe(actorChanged);
 await act(async()=>root.unmount());
});
