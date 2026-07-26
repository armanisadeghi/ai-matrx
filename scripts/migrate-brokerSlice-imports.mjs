/**
 * One-off: replace @/lib/redux/brokerSlice barrel imports with direct module paths.
 * Run: node scripts/migrate-brokerSlice-imports.mjs
 */
import fs from "node:fs";
import { execSync } from "node:child_process";

const double = execSync(
  'git -C . grep -l "from \\\"@/lib/redux/brokerSlice\\\"" -- "*.ts" "*.tsx" 2>/dev/null || true',
  { encoding: "utf8", cwd: new URL("..", import.meta.url) },
);
const single = execSync(
  "git -C . grep -l \"from '@/lib/redux/brokerSlice'\" -- \"*.ts\" \"*.tsx\" 2>/dev/null || true",
  { encoding: "utf8", cwd: new URL("..", import.meta.url) },
);
const files = [
  ...new Set(
    `${double}\n${single}`
      .split("\n")
      .map((l) => l.trim())
      .filter((f) => f && !f.includes(".claude/")),
  ),
];

function migrate(content) {
  let c = content;
  c = c.replace(
    /import \{ brokerSelectors, brokerActions, BrokerIdentifier \} from "@\/lib\/redux\/brokerSlice"; \/\/ Update to the new brokerSlice path/,
    `import { brokerSelectors } from "@/lib/redux/brokerSlice/brokerSelectors";\nimport { brokerActions } from "@/lib/redux/brokerSlice/slice";\nimport type { BrokerIdentifier } from "@/lib/redux/brokerSlice/types"; // Update to the new brokerSlice path`,
  );
  c = c.replace(
    /import \{ brokerActions, brokerSelectors, useServerBrokerSync, BrokerIdentifier \} from '@\/lib\/redux\/brokerSlice';/g,
    `import { brokerSelectors } from "@/lib/redux/brokerSlice/brokerSelectors";\nimport { brokerActions } from "@/lib/redux/brokerSlice/slice";\nimport type { BrokerIdentifier } from "@/lib/redux/brokerSlice/types";\nimport { useServerBrokerSync } from "@/lib/redux/brokerSlice/hooks/useServerBrokerSync";`,
  );
  c = c.replace(
    /import \{ brokerSelectors, BrokerIdentifier, brokerActions, useServerBrokerSync \} from "@\/lib\/redux\/brokerSlice";/g,
    `import { brokerSelectors } from "@/lib/redux/brokerSlice/brokerSelectors";\nimport { brokerActions } from "@/lib/redux/brokerSlice/slice";\nimport type { BrokerIdentifier } from "@/lib/redux/brokerSlice/types";\nimport { useServerBrokerSync } from "@/lib/redux/brokerSlice/hooks/useServerBrokerSync";`,
  );
  c = c.replace(
    /import \{ brokerActions, brokerSelectors \} from '@\/lib\/redux\/brokerSlice';/g,
    `import { brokerSelectors } from "@/lib/redux/brokerSlice/brokerSelectors";\nimport { brokerActions } from "@/lib/redux/brokerSlice/slice";`,
  );
  c = c.replace(
    /import \{ brokerActions, brokerSelectors \} from "@\/lib\/redux\/brokerSlice";/g,
    `import { brokerSelectors } from "@/lib/redux/brokerSlice/brokerSelectors";\nimport { brokerActions } from "@/lib/redux/brokerSlice/slice";`,
  );
  c = c.replace(
    /import \{ brokerSelectors, brokerActions \} from "@\/lib\/redux\/brokerSlice";/g,
    `import { brokerSelectors } from "@/lib/redux/brokerSlice/brokerSelectors";\nimport { brokerActions } from "@/lib/redux/brokerSlice/slice";`,
  );
  c = c.replace(
    /import \{ brokerActions, brokerSelectors \} from "@\/lib\/redux\/brokerSlice";/g,
    `import { brokerSelectors } from "@/lib/redux/brokerSlice/brokerSelectors";\nimport { brokerActions } from "@/lib/redux/brokerSlice/slice";`,
  );
  c = c.replace(
    /import \{ brokerActions, BrokerMapEntry \} from "@\/lib\/redux\/brokerSlice";/g,
    `import { brokerActions } from "@/lib/redux/brokerSlice/slice";\nimport type { BrokerMapEntry } from "@/lib/redux/brokerSlice/types";`,
  );
  c = c.replace(
    /import \{ brokerActions \} from "@\/lib\/redux\/brokerSlice";/g,
    `import { brokerActions } from "@/lib/redux/brokerSlice/slice";`,
  );
  c = c.replace(
    /import \{ brokerActions \} from '@\/lib\/redux\/brokerSlice';/g,
    `import { brokerActions } from "@/lib/redux/brokerSlice/slice";`,
  );
  c = c.replace(
    /import \{ brokerSelectors \} from "@\/lib\/redux\/brokerSlice";/g,
    `import { brokerSelectors } from "@/lib/redux/brokerSlice/brokerSelectors";`,
  );
  c = c.replace(
    /import \{ brokerSelectors \} from '@\/lib\/redux\/brokerSlice';/g,
    `import { brokerSelectors } from "@/lib/redux/brokerSlice/brokerSelectors";`,
  );
  c = c.replace(
    /import \{ brokerActions, brokerSelectors \} from "@\/lib\/redux\/brokerSlice";/g,
    `import { brokerSelectors } from "@/lib/redux/brokerSlice/brokerSelectors";\nimport { brokerActions } from "@/lib/redux/brokerSlice/slice";`,
  );
  return c;
}

const root = new URL("..", import.meta.url);
let n = 0;
for (const f of files) {
  const full = new URL(f, root);
  const p = full.pathname;
  if (!fs.existsSync(p)) continue;
  const before = fs.readFileSync(p, "utf8");
  if (!before.includes("@/lib/redux/brokerSlice")) continue;
  const after = migrate(before);
  if (after !== before) {
    fs.writeFileSync(p, after);
    n++;
  }
}
console.log("migrate-brokerSlice-imports: updated", n, "of", files.length, "candidates");
