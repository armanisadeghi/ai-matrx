// features/education/classes/service.ts
//
// CLIENT data path for the class MEMBERSHIP + ACCESS MODEL (Convergence C). Per
// CLAUDE.md, UI↔DB goes DIRECT via supabase-js — the edu_class_* SECURITY DEFINER
// RPCs are the authorization layer (gated on the caller's membership role;
// context.scopes RLS denies non-members). This module is the ONE typed wrapper
// over that PUBLISHED CONTRACT — the creator landing page + class hub consume it.
//
// Contract (all RPCs live in the DB, applied via
// migrations/edu_class_membership_access_model.sql):
//   edu_class_state(p_class)              → ClassAccessState (the Join button's truth)
//   edu_class_join(p_class)               → open→joined | closed→needs_request | paid→needs_purchase/joined
//   edu_class_request(p_class)            → closed→pending (open/paid delegate to join)
//   edu_class_approve(p_class, p_user)    → owner approves a pending request
//   edu_class_leave(p_class)              → member leaves
//   edu_class_remove(p_class, p_user)     → owner removes a member / declines a request
//   edu_class_roster(p_class)             → ClassRosterMember[] (owner: all; member: active)
//   edu_class_grant(p_class, p_user)      → owner comps the paid class_access grant
//   edu_class_purchase(p_class)           → STUB purchase → entitled (real Stripe Connect pending)
//   edu_class_set_access(p_class, mode)   → owner sets access_mode + ensures owner membership
//   edu_my_classes()                      → MyClass[] the caller owns / joined / requested

"use client";

import { createClient } from "@/utils/supabase/client";
import { parseClassSettings, parseAccessMode } from "./settings";
import type {
  AccessMode,
  ClassAccessState,
  ClassJoinResult,
  ClassJoinStatus,
  ClassRole,
  ClassRosterMember,
  ClassStatus,
  MyClass,
} from "./types";

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function role(v: unknown): ClassRole | null {
  return v === "owner" || v === "member" ? v : null;
}
function status(v: unknown): ClassStatus | null {
  return v === "active" || v === "pending" || v === "entitled" ? v : null;
}

function coerceJoin(data: unknown): ClassJoinResult {
  const o = rec(data);
  return {
    status: (str(o.status) ?? "ok") as ClassJoinStatus,
    role: role(o.role) ?? undefined,
    accessMode: (str(o.access_mode) as AccessMode | null) ?? undefined,
    stub: o.stub === true,
    userId: str(o.user_id) ?? undefined,
  };
}

function coerceState(data: unknown): ClassAccessState {
  const o = rec(data);
  return {
    classId: str(o.class_id) ?? "",
    name: str(o.name) ?? "",
    description: str(o.description) ?? "",
    slug: str(o.slug),
    organizationId: str(o.organization_id) ?? "",
    accessMode: parseAccessMode(o.access_mode),
    isOwner: o.is_owner === true,
    myRole: role(o.my_role),
    myStatus: status(o.my_status),
    memberCount: typeof o.member_count === "number" ? o.member_count : 0,
    pendingCount: typeof o.pending_count === "number" ? o.pending_count : null,
  };
}

function coerceRoster(data: unknown): ClassRosterMember[] {
  if (!Array.isArray(data)) return [];
  return data.map((row) => {
    const o = rec(row);
    return {
      userId: str(o.user_id) ?? "",
      email: str(o.email),
      role: role(o.role) ?? "member",
      status: status(o.status) ?? "active",
      createdAt: str(o.created_at) ?? "",
    };
  });
}

function coerceMyClasses(data: unknown): MyClass[] {
  if (!Array.isArray(data)) return [];
  return data.map((row) => {
    const o = rec(row);
    return {
      classId: str(o.class_id) ?? "",
      name: str(o.name) ?? "",
      description: str(o.description) ?? "",
      slug: str(o.slug),
      organizationId: str(o.organization_id) ?? "",
      accessMode: parseAccessMode(o.access_mode),
      myRole: role(o.my_role) ?? "member",
      myStatus: status(o.my_status) ?? "active",
      ownerId: str(o.owner_id),
      settings: parseClassSettings(o.settings),
    };
  });
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function getClassState(classId: string): Promise<ClassAccessState> {
  const { data, error } = await createClient().rpc("edu_class_state", {
    p_class: classId,
  });
  if (error) throw new Error(error.message);
  return coerceState(data);
}

export async function getClassRoster(
  classId: string,
): Promise<ClassRosterMember[]> {
  const { data, error } = await createClient().rpc("edu_class_roster", {
    p_class: classId,
  });
  if (error) throw new Error(error.message);
  return coerceRoster(data);
}

export async function getMyClasses(): Promise<MyClass[]> {
  const { data, error } = await createClient().rpc("edu_my_classes");
  if (error) throw new Error(error.message);
  return coerceMyClasses(data);
}

// ─── Membership writes ─────────────────────────────────────────────────────────

export async function joinClass(classId: string): Promise<ClassJoinResult> {
  const { data, error } = await createClient().rpc("edu_class_join", {
    p_class: classId,
  });
  if (error) throw new Error(error.message);
  return coerceJoin(data);
}

export async function requestClass(classId: string): Promise<ClassJoinResult> {
  const { data, error } = await createClient().rpc("edu_class_request", {
    p_class: classId,
  });
  if (error) throw new Error(error.message);
  return coerceJoin(data);
}

export async function leaveClass(classId: string): Promise<ClassJoinResult> {
  const { data, error } = await createClient().rpc("edu_class_leave", {
    p_class: classId,
  });
  if (error) throw new Error(error.message);
  return coerceJoin(data);
}

// ─── Owner controls ────────────────────────────────────────────────────────────

export async function approveMember(
  classId: string,
  userId: string,
): Promise<ClassJoinResult> {
  const { data, error } = await createClient().rpc("edu_class_approve", {
    p_class: classId,
    p_user: userId,
  });
  if (error) throw new Error(error.message);
  return coerceJoin(data);
}

export async function removeMember(
  classId: string,
  userId: string,
): Promise<ClassJoinResult> {
  const { data, error } = await createClient().rpc("edu_class_remove", {
    p_class: classId,
    p_user: userId,
  });
  if (error) throw new Error(error.message);
  return coerceJoin(data);
}

/** Owner comps a user the paid class_access grant (no purchase). */
export async function grantAccess(
  classId: string,
  userId: string,
): Promise<ClassJoinResult> {
  const { data, error } = await createClient().rpc("edu_class_grant", {
    p_class: classId,
    p_user: userId,
  });
  if (error) throw new Error(error.message);
  return coerceJoin(data);
}

/** Owner sets access_mode (+ ensures the owner membership row). */
export async function setAccessMode(
  classId: string,
  mode: AccessMode,
): Promise<void> {
  const { error } = await createClient().rpc("edu_class_set_access", {
    p_class: classId,
    p_access_mode: mode,
  });
  if (error) throw new Error(error.message);
}

// ─── Paid gate (STUB) ──────────────────────────────────────────────────────────

/**
 * STUB purchase — confers the caller the paid class_access grant directly. Real
 * money movement (Stripe Connect payouts + revenue share) is PENDING (Arman);
 * when Connect lands, the checkout webhook replaces this direct grant.
 */
export async function purchaseClass(classId: string): Promise<ClassJoinResult> {
  const { data, error } = await createClient().rpc("edu_class_purchase", {
    p_class: classId,
  });
  if (error) throw new Error(error.message);
  return coerceJoin(data);
}
