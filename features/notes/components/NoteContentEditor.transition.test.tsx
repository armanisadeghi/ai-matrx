let captured: unknown;
jest.mock("@/features/context-menu-v3/EditableContextMenu", () => ({ EditableContextMenu: ({ children }: {children: React.ReactNode}) => <>{children}</> }));
jest.mock("./NoteEditorCore", () => ({ NoteEditorCore: (props: { actionsSource: unknown }) => { captured = props.actionsSource; return <div />; } }));
jest.mock("next/dynamic", () => () => () => null);
jest.mock("../hooks/useNoteAccess", () => ({ useNoteAccess: () => ({ readOnly: false }) }));
jest.mock("../hooks/usePreferredDefaultEditorMode", () => ({ normalizeNoteEditorMode: (v: string | undefined) => v ?? "wysiwyg", usePreferredDefaultEditorMode: () => "wysiwyg" }));
jest.mock("../hooks/useNotesSurfaceScope", () => ({ useNotesSurfaceScope: () => () => ({}) }));
jest.mock("../hooks/useNoteUndoRedo", () => ({ useNoteUndoRedo: () => ({}) }));
jest.mock("../hooks/useNoteArtifactMaterialization", () => ({ useNoteArtifactMaterialization: () => ({}) }));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({ confirm: jest.fn() }));
jest.mock("@/lib/toast", () => ({ toast: new Proxy({}, { get: () => jest.fn() }) }));
import React, { act } from "react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { enableMapSet } from "immer";
enableMapSet();
import { createRoot } from "react-dom/client";
import notesReducer, { markNoteSaved, upsertNoteFromServer, setNoteField } from "../redux/slice";
import { createBlankNoteRecord } from "../redux/notes.types";
import { NotesInstanceProvider } from "../context/NotesInstanceContext";
import { NoteContentEditor } from "./NoteContentEditor";
import type { Note } from "../types";
const id="33333333-3333-4333-8333-333333333333",org="11111111-1111-4111-8111-111111111111",actor="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const note=(o:Partial<Note>={}):Note=>({id,organization_id:org,version:4,content:"base",label:"N",folder_name:null,folder_id:null,tags:[],metadata:{},visibility:"personal",position:0,project_id:null,task_id:null,created_at:"",created_by:actor,updated_at:"",updated_by:actor,deleted_at:null,content_hash:null,file_path:null,last_device_id:null,sync_version:0,...o});
it("renders mounted realtime, dirty, and acknowledgement transitions without rebasing the draft",async()=>{
 (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 Object.defineProperty(window, "matchMedia", { value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }), configurable: true });
 const store=configureStore({reducer:{notes:notesReducer,userAuth:(state={id:actor,authReady:true})=>state},middleware:(gdm)=>gdm({serializableCheck:false})});
 const root=createRoot(document.createElement("div"));
 const render=async()=>act(async()=>root.render(<Provider store={store}><NotesInstanceProvider value="i"><NoteContentEditor noteId={id}/></NotesInstanceProvider></Provider>));
 try {
   await act(async()=>{ store.dispatch(upsertNoteFromServer({note:note(),fetchStatus:"full"})); });
   await render(); expect(captured).toMatchObject({type:"note",mode:"editable",editBase:{version:4}});
   await act(async()=>{ store.dispatch(upsertNoteFromServer({note:note({version:5,content:"remote"}),fetchStatus:"list"})); });
   expect(captured).toMatchObject({type:"note",mode:"identity"});
   await act(async()=>{ store.dispatch(setNoteField({id,field:"tags",value:["local tag"]})); });
   expect(captured).toMatchObject({type:"note",mode:"editable",editBase:{version:4},displayedPhysicalSnapshot:{version:4,content:"remote"}});
   await act(async()=>{ store.dispatch(setNoteField({id,field:"content",value:"draft"})); });
   expect(captured).toMatchObject({type:"note",mode:"editable",editBase:{version:4},displayedPhysicalSnapshot:{version:4,content:"draft"}});
   await act(async()=>{ store.dispatch(markNoteSaved({id,version:6,updatedAt:"",savedSnapshot:{content:"draft"},acknowledgedPhysicalSnapshot:note({version:6,content:"draft"})})); });
   expect(captured).toMatchObject({type:"note",mode:"editable",editBase:{version:6}});
 } finally { await act(async()=>root.unmount()); }
});

