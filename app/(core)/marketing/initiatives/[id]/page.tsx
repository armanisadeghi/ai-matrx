import { InitiativeDetail } from "@/features/marketing/initiatives/InitiativeDetail";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <InitiativeDetail id={id}/>}

