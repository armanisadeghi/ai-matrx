#!/usr/bin/env node
/**
 * check-fake-dynamic-imports.mjs
 *
 * Finds "fake" dynamic imports: a module pulled in via `import()` / `next/dynamic`
 * that is ALSO statically imported somewhere else in the repo.
 *
 * WHY THIS IS A DEFECT, not a style nit:
 * A dynamic import does NOT remove a module from the build. It creates a CHUNK
 * BOUNDARY; the module is still compiled. It only pays off when that module is
 * reachable EXCLUSIVELY through a human action (a click, an opened menu). If
 * anything else imports it statically, the module is in the build regardless and
 * all you bought is an extra chunk, extra chunk-graph assembly, and MORE PEAK BUILD
 * MEMORY. On this repo that matters: production builds have been OOM-killed
 * (SIGKILL) during "Creating an optimized production build" on a 60 GB builder.
 *
 * Learned the hard way in commit 899342703: four static imports in
 * features/shell/navigation/navActions.ts were "optimized" into `await import()`.
 * Their targets had 37 / 13 / 6 / 5 other static importers, so the split removed
 * nothing and added four chunk boundaries. Reverted in this change.
 *
 * NOT every hit is a bug — read each one:
 *   - Legitimate: `await import()` used to BREAK AN IMPORT CYCLE (common for
 *     utils/supabase/client.ts inside redux slices), or to keep a Node-only module
 *     out of a client bundle.
 *   - Bug: a dynamic import added purely as a misguided bundle "optimization".
 * This script reports candidates ranked by how pointless the split is (how many
 * other static importers the target already has). Judgment still required.
 *
 * Usage: node scripts/check-fake-dynamic-imports.mjs [--top N]
 */
import fs from 'node:fs';
import path from 'node:path';
const ROOT=process.cwd();
const DIRS=['app','components','features','lib','hooks','utils','providers','constants','config','actions','packages'];
const EXT=['.tsx','.ts','.jsx','.js','.mjs'];
function walk(d,out){let e;try{e=fs.readdirSync(d,{withFileTypes:true})}catch{return}
 for(const x of e){if(x.name==='node_modules'||x.name.startsWith('.next')||x.name==='.git')continue;
  const p=path.join(d,x.name); if(x.isDirectory())walk(p,out);
  else if(/\.(ts|tsx|js|jsx|mjs)$/.test(x.name)&&!/\.d\.ts$/.test(x.name))out.push(p);}}
const files=[]; for(const d of DIRS) walk(path.join(ROOT,d),files);
const set=new Set(files);
function resolve(spec,from){
  let base;
  if(spec.startsWith('@/')) base=path.join(ROOT,spec.slice(2));
  else if(spec.startsWith('.')) base=path.resolve(path.dirname(from),spec);
  else return null;
  for(const e of EXT){ if(set.has(base+e)) return base+e; }
  for(const e of EXT){ const i=path.join(base,'index'+e); if(set.has(i)) return i; }
  return set.has(base)?base:null;
}
const STATIC=/^[ \t]*import\s+(?!type\b)[^;]*?from\s*['"]([^'"]+)['"]/gm;
const SIDE=/^[ \t]*import\s*['"]([^'"]+)['"]/gm;
const DYN=/import\(\s*['"]([^'"]+)['"]\s*\)/g;
const staticImporters=new Map(), dynSites=[];
for(const f of files){
  let s; try{s=fs.readFileSync(f,'utf8')}catch{continue}
  for(const re of [STATIC,SIDE]){ re.lastIndex=0; let m;
    while((m=re.exec(s))){ const r=resolve(m[1],f); if(!r)continue;
      if(!staticImporters.has(r))staticImporters.set(r,new Set()); staticImporters.get(r).add(f); } }
  DYN.lastIndex=0; let m;
  while((m=DYN.exec(s))){ const r=resolve(m[1],f); if(!r)continue;
    const line=s.slice(0,m.index).split('\n').length;
    dynSites.push({file:f,target:r,line,spec:m[1]}); }
}
const rows=[];
for(const d of dynSites){
  const imps=staticImporters.get(d.target)||new Set();
  const others=[...imps].filter(x=>x!==d.file);
  if(others.length>0) rows.push({...d,count:others.length,sample:others.slice(0,2)});
}
rows.sort((a,b)=>b.count-a.count);
console.log('FAKE DYNAMIC IMPORTS — target is also statically imported elsewhere\n');
console.log('static\n importers  dynamic-import site -> target');
const TOP=Number((process.argv.find(a=>a.startsWith('--top='))||'--top=40').split('=')[1]);
for(const r of rows.slice(0,TOP)){
  console.log(String(r.count).padStart(6)+'  '+path.relative(ROOT,r.file)+':'+r.line);
  console.log('        -> '+path.relative(ROOT,r.target));
}
console.log('\nTOTAL dynamic import sites:', dynSites.length);
console.log('TOTAL that are FAKE (target statically imported elsewhere):', rows.length);
