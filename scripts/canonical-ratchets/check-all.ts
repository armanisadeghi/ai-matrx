import { spawnSync } from "node:child_process";

const checks = [
    "scripts/canonical-ratchets/check-unregistered-entities.ts",
    "scripts/canonical-ratchets/check-post-doctrine-conformance.ts",
    "scripts/canonical-ratchets/check-org-null.ts",
];

const refresh = process.argv.includes("--refresh");

for (const [index, check] of checks.entries()) {
    const args = ["exec", "tsx", check];
    if (refresh && index === 0) {
        args.push("--refresh");
    }

    const result = spawnSync("pnpm", args, {
        cwd: process.cwd(),
        stdio: "inherit",
    });

    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}
