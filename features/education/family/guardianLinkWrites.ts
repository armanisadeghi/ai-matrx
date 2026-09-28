import { collectionWriteHandlers, collectProblems, readCollectionList, repeatsProblem } from "@/features/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";
import { familyService } from "./familyService";
import type { GuardianLinkView } from "./types";

function record(value: unknown, at: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${at} must be an object.`);
  return value as Record<string, unknown>;
}

function email(value: unknown, at: string): string {
  if (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))
    throw new Error(`${at} must be a valid email address.`);
  return value.trim();
}

function id(value: unknown, at: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${at} needs an id.`);
  return value;
}

function list(value: unknown, target: string): unknown[] {
  return readCollectionList(target, target.replace(/^(create|update|delete)_/, ""), value);
}

export function parseGuardianRequests(value: unknown): string[] {
  const target = "create_guardian_requests";
  return collectProblems(target, list(value, target), (item, index) =>
    email(record(item, `${target}[${index}]`).student_email, `${target}[${index}].student_email`), {
    listChecks: (items) => [repeatsProblem(target, items.map((item) => item.value), "student email")],
  });
}

export function parseGuardianGrants(value: unknown): string[] {
  const target = "create_guardian_grants";
  return collectProblems(target, list(value, target), (item, index) =>
    email(record(item, `${target}[${index}]`).guardian_email, `${target}[${index}].guardian_email`), {
    listChecks: (items) => [repeatsProblem(target, items.map((item) => item.value), "guardian email")],
  });
}

export function parseGuardianResponses(value: unknown, links: readonly GuardianLinkView[]) {
  const target = "update_guardian_requests";
  return collectProblems(target, list(value, target), (item, index) => {
    const raw = record(item, `${target}[${index}]`);
    const linkId = id(raw.id, `${target}[${index}].id`);
    const link = links.find((candidate) => candidate.id === linkId);
    if (!link || link.role !== "student" || link.status !== "pending")
      throw new Error(`${target}[${index}].id is not a pending guardian request awaiting this learner's decision.`);
    if (typeof raw.approve !== "boolean") throw new Error(`${target}[${index}].approve must be true or false.`);
    return { link, approve: raw.approve };
  }, { listChecks: (items) => [repeatsProblem(target, items.map((item) => item.value?.link.id), "id")] });
}

export function parseGuardianUnlinks(value: unknown, links: readonly GuardianLinkView[]) {
  const target = "delete_guardian_links";
  return collectProblems(target, list(value, target), (item, index) => {
    const linkId = id(typeof item === "string" ? item : record(item, `${target}[${index}]`).id, `${target}[${index}].id`);
    const link = links.find((candidate) => candidate.id === linkId);
    if (!link) throw new Error(`${target}[${index}].id is not a current guardian link or request.`);
    return link;
  }, { listChecks: (items) => [repeatsProblem(target, items.map((item) => item.value?.id), "id")] });
}

/** The same four service calls as the Family dashboard's human controls. */
export function guardianLinkWriteHandlers(links: readonly GuardianLinkView[], onChanged: () => void) {
  return {
    ...collectionWriteHandlers({
      plural: "guardian_requests",
      singular: "guardian request",
      create: {
        parse: parseGuardianRequests,
        run: async (studentEmail) => {
          const result = await familyService.requestStudent(studentEmail);
          if (result.error) throw new Error(result.error);
          onChanged();
          return { id: studentEmail, name: studentEmail };
        },
        nameOf: (studentEmail) => studentEmail,
      },
      update: {
        parse: (value) => parseGuardianResponses(value, links),
        run: async ({ link, approve }) => {
          const result = await familyService.respond(link.counterpart_user_id, approve);
          if (result.error) throw new Error(result.error);
          onChanged();
          return { id: link.id, name: link.counterpart_email };
        },
        nameOf: ({ link }) => link.counterpart_email,
      },
    }, refuseSurfaceWrite),
    ...collectionWriteHandlers({
      plural: "guardian_grants",
      singular: "guardian grant",
      create: {
        parse: parseGuardianGrants,
        run: async (guardianEmail) => {
          const result = await familyService.grantGuardian(guardianEmail, "guardian");
          if (result.error) throw new Error(result.error);
          onChanged();
          return { id: guardianEmail, name: guardianEmail };
        },
        nameOf: (guardianEmail) => guardianEmail,
      },
    }, refuseSurfaceWrite),
    ...collectionWriteHandlers({
      plural: "guardian_links",
      singular: "guardian link",
      delete: {
        parse: (value) => parseGuardianUnlinks(value, links),
        run: async (link) => {
          const result = await familyService.unlink(link.guardian_user_id, link.student_user_id);
          if (result.error) throw new Error(result.error);
          onChanged();
          return { id: link.id, name: link.counterpart_email };
        },
        nameOf: (link) => link.counterpart_email,
      },
    }, refuseSurfaceWrite),
  };
}
