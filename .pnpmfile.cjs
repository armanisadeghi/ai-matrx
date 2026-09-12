'use strict';
// The ONE mechanism pnpm always runs before it relinks anything.
//
// The root package.json "preinstall" script does NOT work as a guard here:
// pnpm runs the root project's lifecycle scripts AFTER linking, and skips them
// entirely for `pnpm add`, `pnpm remove` and `--ignore-scripts`. This file is
// loaded while pnpm assembles the install context — before the first symlink
// moves — for every install-family command. Evidence and measurements:
// scripts/agent-harness/install-gate.cjs.
require('./scripts/agent-harness/install-gate.cjs').run();

module.exports = { hooks: {} };
