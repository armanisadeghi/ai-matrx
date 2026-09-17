/**
 * check:campaign-ports — the unified-data campaign's dev-server port allocation.
 *
 * WHY (ATTACK-9 finding 26). §2's peak is seven concurrent builder lanes, each
 * given "per-process overrides on this lane's own dev server" (§5.9), in ONE
 * shared working tree, and the build book allocates no ports at all. The failure
 * is silent in both directions: a second `next dev` on a taken port either binds
 * a port Next.js chose for it — so the lane drives a browser at an address it
 * does not own — or it reaches an ALREADY RUNNING server belonging to another
 * lane and verifies that lane's environment overrides believing they are its own.
 * Either way the lane's exit proof is a green screenshot of the wrong system.
 * Nothing in the plan, the repo or Next.js says a word when it happens.
 *
 * WHAT THIS REFUSES:
 *   1. two rows holding the same port                      (map defect)
 *   2. a port outside the declared range                   (map defect)
 *   3. a lane port that is OCCUPIED right now              (machine not ready)
 *
 * Usage:
 *   pnpm check:campaign-ports                 whole map + every lane's occupancy
 *   pnpm check:campaign-ports --lane W6-CHAT  just mine — is my port free, now
 *   pnpm check:campaign-ports --self-test     proves rules 1 and 2 still bite
 *
 * The reserved `preview:start` row on 3001 is checked for duplicates and range
 * but never for occupancy: 3001 being busy is that row working as intended.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(HERE, "campaign-ports.json");

interface PortMap {
    portRange: { min: number; max: number };
    reserved: { holder: string; port: number; why: string }[];
    lanes: Record<string, number>;
    noDevServer: Record<string, string>;
}

interface Problem {
    rule: "duplicate" | "range" | "occupied";
    message: string;
}

/** Who is listening on `port`, or null. Never opens a socket of its own. */
function listenerOn(port: number): string | null {
    try {
        const out = execFileSync(
            "lsof",
            ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-F", "pcn"],
            { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
        ).trim();
        if (!out) return null;
        // -F pcn emits p<pid> / c<command> / n<name> lines.
        const pid = out.match(/^p(\d+)/m)?.[1] ?? "?";
        const command = out.match(/^c(.+)$/m)?.[1] ?? "?";
        return `${command} (pid ${pid})`;
    } catch {
        // lsof exits 1 when nothing matches. Absent lsof is indistinguishable
        // here, so say so rather than reporting a free port we did not check.
        return null;
    }
}

function lsofAvailable(): boolean {
    try {
        execFileSync("lsof", ["-v"], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}

/** Rules 1 and 2 — pure, so the self-test can feed them a broken map. */
export function auditMap(map: PortMap): Problem[] {
    const problems: Problem[] = [];
    const seen = new Map<number, string>();

    const rows: [string, number][] = [
        ...map.reserved.map((r) => [r.holder, r.port] as [string, number]),
        ...Object.entries(map.lanes),
    ];

    for (const [holder, port] of rows) {
        const prior = seen.get(port);
        if (prior !== undefined) {
            problems.push({
                rule: "duplicate",
                message: `port ${port} is held by BOTH ${prior} and ${holder} — two lanes on one port is the exact failure this map exists to prevent`,
            });
        } else {
            seen.set(port, holder);
        }
        if (port < map.portRange.min || port > map.portRange.max) {
            problems.push({
                rule: "range",
                message: `${holder} is on ${port}, outside the declared range ${map.portRange.min}–${map.portRange.max}`,
            });
        }
    }

    for (const lane of Object.keys(map.noDevServer)) {
        if (lane in map.lanes) {
            problems.push({
                rule: "duplicate",
                message: `${lane} is in BOTH lanes and noDevServer — the map contradicts itself about whether it runs a dev server`,
            });
        }
    }

    return problems;
}

function selfTest(): number {
    const broken: PortMap = {
        portRange: { min: 3001, max: 3013 },
        reserved: [{ holder: "preview:start", port: 3001, why: "x" }],
        lanes: { "W6-CHAT": 3005, "W6-DASH": 3005, "W6-BOOK": 4000 },
        noDevServer: { "W6-CHAT": "contradiction" },
    };
    const found = auditMap(broken);
    const kinds = new Set(found.map((p) => p.rule));
    const wantDuplicate = kinds.has("duplicate");
    const wantRange = kinds.has("range");

    console.log("  self-test: a map with a duplicate port, an out-of-range port");
    console.log("             and a lane listed twice must produce findings:");
    for (const p of found) console.log(`               [${p.rule}] ${p.message}`);

    const healthy = auditMap(JSON.parse(readFileSync(MAP_PATH, "utf8")) as PortMap);
    console.log(`  self-test: the real map must produce none — produced ${healthy.length}`);

    if (!wantDuplicate || !wantRange || found.length < 3 || healthy.length !== 0) {
        console.error("  ✗ self-test FAILED: the port audit no longer bites.");
        return 1;
    }
    console.log("  ✓ self-test passed — the audit still refuses a broken map.");
    return 0;
}

function main(): number {
    const argv = process.argv.slice(2);
    if (argv.includes("--self-test")) return selfTest();

    const laneFlag = argv.indexOf("--lane");
    const onlyLane = laneFlag >= 0 ? argv[laneFlag + 1] : undefined;

    const map = JSON.parse(readFileSync(MAP_PATH, "utf8")) as PortMap;
    const problems = auditMap(map);

    if (onlyLane !== undefined && !(onlyLane in map.lanes)) {
        const why = map.noDevServer[onlyLane];
        console.error(
            why
                ? `  ✗ ${onlyLane} has no dev-server port by design: ${why}`
                : `  ✗ ${onlyLane} is not in scripts/campaign-ports.json. Known lanes: ${Object.keys(map.lanes).join(", ")}`,
        );
        return 1;
    }

    const lanesToProbe = onlyLane
        ? ([[onlyLane, map.lanes[onlyLane]]] as [string, number][])
        : (Object.entries(map.lanes) as [string, number][]);

    if (!lsofAvailable()) {
        console.error(
            "  ✗ lsof is not available, so port occupancy could not be measured.\n" +
                "    UNMEASURED is not a pass. Install lsof or run this on a machine that has it.",
        );
        return 1;
    }

    for (const [lane, port] of lanesToProbe) {
        const who = listenerOn(port);
        if (who) {
            problems.push({
                rule: "occupied",
                message: `${lane}'s port ${port} is ALREADY IN USE by ${who} — start here and your dev server silently lands somewhere else, or attaches to that one`,
            });
        }
    }

    if (problems.length > 0) {
        console.error(`  ✗ check:campaign-ports: ${problems.length} problem(s)\n`);
        for (const p of problems) console.error(`      [${p.rule}] ${p.message}`);
        console.error(
            "\n    Map: scripts/campaign-ports.json" +
                "\n    A lane NEVER runs a bare `pnpm dev` and never guesses a port." +
                "\n    Free an occupied port, or fix the map — never silently move.",
        );
        return 1;
    }

    const shown = lanesToProbe
        .map(([lane, port]) => `${lane}→${port}`)
        .join("  ");
    console.log(
        `  ✓ check:campaign-ports: ${lanesToProbe.length} lane port(s) allocated, unique, in range ${map.portRange.min}–${map.portRange.max}, and free right now.`,
    );
    console.log(`    ${shown}`);
    console.log(
        `    reserved: ${map.reserved.map((r) => `${r.holder}→${r.port}`).join(", ")} (occupancy not checked — that is its job)`,
    );
    return 0;
}

process.exit(main());
