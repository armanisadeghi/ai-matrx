"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/utils/supabase/client";

type Recipe = { id:string; normalized_origin:string; match_pattern:string|null; field_map: unknown; submit: unknown; success_signals: unknown; failure_signals: unknown; challenge_signals: unknown; status:string; recipe_version:number; version:number; deleted_at:string|null };
const safe = (value: unknown) => Array.isArray(value) || (typeof value === "object" && value !== null);
export function RecipeReview({ id }: { id: string }) {
 const [row,setRow]=useState<Recipe|null>(null); const [error,setError]=useState<string|undefined>(); const [busy,setBusy]=useState(false);
 const load=async()=>{const {data,error}=await supabase.schema("browser").from("login_recipe").select("id,normalized_origin,match_pattern,field_map,submit,success_signals,failure_signals,challenge_signals,status,recipe_version,version,deleted_at").eq("id",id).maybeSingle(); if(error||!data){setError(error?.message??"Recipe is unavailable.");return;} setRow(data);};
 useEffect(()=>{void load();},[id]);
 const valid=!!row && row.status==="proposed" && !row.deleted_at && safe(row.field_map)&&safe(row.submit)&&safe(row.success_signals)&&safe(row.failure_signals)&&safe(row.challenge_signals);
 const activate=async()=>{if(!row||!valid)return; setBusy(true); setError(undefined); const {data:active}=await supabase.schema("browser").from("login_recipe").select("id").eq("normalized_origin",row.normalized_origin).eq("match_pattern",row.match_pattern).eq("status","active").is("deleted_at",null).neq("id",row.id).maybeSingle(); if(active){setError("An active recipe already exists for this origin and path.");setBusy(false);return;} const {data,error}=await supabase.schema("browser").from("login_recipe").update({status:"active",version:row.version+1}).eq("id",row.id).eq("status","proposed").is("deleted_at",null).eq("recipe_version",row.recipe_version).eq("version",row.version).select("id").maybeSingle(); if(error||!data)setError("Activation did not apply; review the current recipe state."); await load(); setBusy(false);};
 if(error&&!row)return <p className="text-sm text-destructive">{error}</p>; if(!row)return <p className="text-sm text-muted-foreground">Loading recipe…</p>;
 return <Card className="max-w-2xl"><CardHeader><CardTitle>Login recipe review</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p>{row.normalized_origin}{row.match_pattern??""}</p><p>Status: {row.status} · content version {row.recipe_version}</p><pre className="max-h-72 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify({fields:row.field_map,submit:row.submit,success:row.success_signals,failure:row.failure_signals,challenge:row.challenge_signals},null,2)}</pre>{error&&<p className="text-destructive">{error}</p>}<Button disabled={!valid||busy} onClick={()=>void activate()}>{busy?"Activating…":valid?"Activate recipe":"Activation unavailable"}</Button></CardContent></Card>;
}
