import { signIn, UA } from "./lib.mjs";
const s = await signIn();
const h = {"User-Agent":UA,apikey:s.key,Authorization:`Bearer ${s.token}`,"Content-Type":"application/json","Content-Profile":"custom","Accept-Profile":"custom"};
const out=[];
for(let i=0;i<8;i++){const t=performance.now();const r=await fetch(`${s.url}/rest/v1/rpc/data_home`,{method:"POST",headers:h,body:JSON.stringify({p_include_app_tables:false})});const x=await r.text();out.push(`${r.status}:${Math.round(performance.now()-t)}ms`);}
console.log(out.join(" "));
