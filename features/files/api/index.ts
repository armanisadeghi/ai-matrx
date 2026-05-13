/**
 * features/files/api/index.ts
 *
 * Barrel for the REST API layer. Thunks (Phase 2) consume from here.
 */

export * from "@/lib/python-client";
export * as Files from "./files";
export * as Folders from "./folders";
export * as Versions from "./versions";
export * as Permissions from "./permissions";
export * as ShareLinks from "./share-links";
export * as Groups from "./groups";

// Server-side variant — explicit JWT, usable from Next.js route handlers.
export * as Server from "./server-client";
