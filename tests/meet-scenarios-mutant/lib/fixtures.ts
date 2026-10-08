/**
 * FIXTURES — the Node half of lib/fixtures.py, run inside aidream's environment.
 *
 * - `createOrgMember(org)`: a realistic persona from aidream's persona factory, made an active member
 *   of the host's organization, with a one-use magic-link hash for the product's own /auth/confirm.
 * - `deleteOrgMember(member)`: teardown, detached (the factory's sweep can be slow; the persona
 *   carries an expiry and the fixture sweeper is the net). Its log lands in this run's directory.
 * - `meetingTruth(slug)` / `roomTruth(room)`: server truth (database row, LiveKit room) for asserts.
 */
import { execFile, spawn } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { AIDREAM_ROOT, runDir } from "./env";

const run = promisify(execFile);
const SCRIPT = path.join(__dirname, "fixtures.py");

async function fixture<T>(args: string[], timeoutMs = 120_000): Promise<T> {
  const { stdout } = await run("uv", ["run", "--directory", AIDREAM_ROOT, "python", SCRIPT, ...args], {
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
  });
  const line = stdout.trim().split("\n").pop() ?? "";
  return JSON.parse(line) as T;
}

export interface OrgMember {
  user_id: string;
  email: string;
  full_name: string;
  company: string;
  organization_id: string;
  token_hash: string;
  expires_at: string;
}

export const createOrgMember = (organizationId: string, purpose: string): Promise<OrgMember> =>
  fixture<OrgMember>(["member", "--org", organizationId, "--purpose", purpose]);

export function deleteOrgMember(member: OrgMember): string {
  const dir = path.join(runDir(), "teardown");
  mkdirSync(dir, { recursive: true });
  const log = path.join(dir, `${member.user_id}.log`);
  const out = openSync(log, "a");
  const child = spawn(
    "uv",
    ["run", "--directory", AIDREAM_ROOT, "python", SCRIPT, "delete", "--user", member.user_id, "--org", member.organization_id],
    { detached: true, stdio: ["ignore", out, out] },
  );
  child.unref();
  return log;
}

export interface MeetingTruth {
  found: boolean;
  id?: string;
  organization_id?: string;
  room_name?: string;
  started_at?: string | null;
  ended_at?: string | null;
  /** What the product's own auto-end wrote when it ended the meeting (null otherwise). */
  auto_end?: Record<string, unknown> | null;
  ended_by?: string | null;
}

export const meetingTruth = (slug: string): Promise<MeetingTruth> => fixture<MeetingTruth>(["meeting", "--slug", slug], 60_000);

export interface RoomTruth {
  room: string;
  exists: boolean;
  participants: string[];
}

export const roomTruth = (room: string): Promise<RoomTruth> => fixture<RoomTruth>(["room", "--name", room], 60_000);
