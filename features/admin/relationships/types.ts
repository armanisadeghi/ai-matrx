// features/admin/relationships/types.ts
//
// Relationship Manager — typed payloads for the public.admin_relationship_*
// SECURITY DEFINER RPC family (guarded by is_super_admin() in the DB).
// All shapes derive from the generated Database types — never hand-mirrored.

import type { Database } from "@/types/database.types";

export type RelationshipRule =
  Database["public"]["Functions"]["admin_relationship_rules"]["Returns"][number];

export type UnregisteredPair =
  Database["public"]["Functions"]["admin_unregistered_pairs"]["Returns"][number];

export type RelationshipSystemStatus =
  Database["public"]["Functions"]["admin_relationship_system_status"]["Returns"][number];

export type ReachabilityContent =
  Database["public"]["Functions"]["admin_reachability_contents"]["Returns"][number];

export type ReachabilityContainer =
  Database["public"]["Functions"]["admin_reachability_containers"]["Returns"][number];

export type PermissionLevel = Database["public"]["Enums"]["permission_level"];

export type ContainerSide = "none" | "source" | "target";
