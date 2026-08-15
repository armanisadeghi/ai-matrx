#!/usr/bin/env tsx
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { checkContainedBlockedCandidates, checkPatrolCommits } from "./delivery-policy";

function value(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function git(repoRoot: string, args: string[]): string {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function verifiedRemoteReleaseBase(repoRoot: string, head: string): string {
  const tags = git(repoRoot, [
    "tag",
    "--merged",
    head,
    "--list",
    "v[0-9]*",
    "--sort=-version:refname",
  ])
    .split("\n")
    .filter(Boolean);
  for (const tag of tags) {
    const localCommit = git(repoRoot, ["rev-parse", `${tag}^{commit}`]);
    const remote = git(repoRoot, ["ls-remote", "--tags", "origin", `refs/tags/${tag}*`])
      .split("\n")
      .filter(Boolean);
    const peeled = remote.find((line) => line.endsWith(`refs/tags/${tag}^{}`)) ?? remote[0];
    if (peeled?.split(/\s+/)[0] === localCommit) return tag;
  }
  throw new Error("no version tag verified against origin is an ancestor of the release head");
}

try {
  const repoRoot = resolve(value("repo") ?? process.cwd());
  const head = value("head") ?? "HEAD";
  const base = value("base") ?? verifiedRemoteReleaseBase(repoRoot, head);
  const problems = [
    ...checkPatrolCommits({ repoRoot, base, head }),
    ...checkContainedBlockedCandidates({ repoRoot, head }),
  ];
  if (problems.length > 0) {
    console.error("PATROL DELIVERY BLOCKED — uncertified or unrecorded patrol work found:");
    for (const problem of problems) console.error(`- ${problem}`);
    process.exitCode = 1;
  } else {
    console.log(`Patrol delivery check passed for ${base}..${head}.`);
  }
} catch (error) {
  console.error(`PATROL DELIVERY CHECK FAILED — ${(error as Error).message}`);
  process.exitCode = 1;
}
