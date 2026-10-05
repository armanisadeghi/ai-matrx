#!/usr/bin/env node
// Prints the generated Space snapshot JSON Schema (--print) or the SQL function (--print-sql).
// Drift against the live database: `pnpm exec jest lib/spaces-blocks/__tests__/snapshot-schema-drift.test.ts`.
import { execFileSync } from "node:child_process";
const mode = process.argv[2] === "--print-sql" ? "sql" : "json";
const code = `import("./lib/spaces-blocks/jsonSchema").then(m=>console.log(${mode === "sql" ? "m.spaceSnapshotSchemaSql()" : "JSON.stringify(m.buildSpaceSnapshotSchema(),null,2)"}))`;
process.stdout.write(execFileSync("pnpm", ["exec", "tsx", "-e", code], { encoding: "utf8" }));
