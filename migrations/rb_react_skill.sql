-- rb_react_skill.sql
-- Render-block skill + content blocks for the ```react``` live-component block.
--
-- Trigger: a ```react fenced code block (aliases ```jsx and ```tsx). Detected in
--   components/mardown-display/markdown-classification/processors/utils/content-splitter-v2.ts
--   (SPECIAL_CODE_LANGUAGES has "react"; CODE_LANGUAGE_ALIASES maps jsx/tsx -> react).
-- Renderer: features/dynamic-react/ReactCodeBlock.tsx (compiled via
--   features/dynamic-react/compileReactComponent.ts -> Babel transform -> new Function
--   with an allowlist-scoped environment). Wired at
--   components/mardown-display/chat-markdown/block-registry/BlockRenderer.tsx (lang jsx|tsx|react).
--
-- Idempotent + schema-qualified. Reuses the existing "Render Blocks" categories
-- (skill 49c845cb…, content-block 6913d9fc…). Does NOT create category rows.
-- Do NOT apply this file directly — the orchestrator applies all render-block
-- migrations centrally.

BEGIN;

-- ============================================================================
-- 1. Skill  ->  skill.definition
-- ============================================================================
-- Composite unique key is (skill_id, user_id, organization_id, project_id), so we
-- INSERT ... SELECT ... WHERE NOT EXISTS (NOT ON CONFLICT (skill_id)), then a
-- insert-once: re-applying is a no-op when the global row exists (no body refresh).

INSERT INTO skill.definition (
  skill_id, label, description, skill_type, body, icon_name,
  platform_targets, semver, category_id,
  is_system, is_active, visibility,
  organization_id, project_id, task_id, sort_order
)
SELECT
  'react-component',
  'Live React Component',
  'How and when to emit ```react (```jsx / ```tsx) blocks that compile and render as a live, interactive React component: the allowlisted imports/hooks/UI available, the no-props/default-export requirement, syntax rules that prevent compile failures, sizing guidance, and editing etiquette.',
  'render_block'::skl_skill_type,
  $BODY$# Live React Component

You can build a live, interactive UI by emitting a ```react code fence. The code
compiles in the browser and renders inline as a real React component — buttons
work, state updates, charts animate, sliders move. It is a **deliverable**: a
working mini-app, not a throwaway snippet. Reach for it whenever a UI would
communicate better than prose or a static image: a calculator, an interactive
chart, a form, a live demo, a small tool, a data explorer, a game.

## How to emit one

Write a standard ```react fence (the aliases ```jsx and ```tsx also work — use
```tsx if you write TypeScript type annotations). Nothing else is needed — no
wrapper tags:

```react
export default function App() {
  const [count, setCount] = useState(0);
  return (
    <Card className="p-4">
      <CardHeader><CardTitle>Counter</CardTitle></CardHeader>
      <CardContent className="flex items-center gap-3">
        <Button onClick={() => setCount((c) => c - 1)}>-</Button>
        <span className="text-2xl font-semibold">{count}</span>
        <Button onClick={() => setCount((c) => c + 1)}>+</Button>
      </CardContent>
    </Card>
  );
}
```

Non-negotiable rules:
- **The block MUST resolve to a component.** Prefer `export default function App() { … }`.
  A single top-level component named `App`, `Main`, `Page`, `Component`, `Demo`,
  `Example`, or `Root` is auto-returned even without `export default`, but writing
  `export default` is the safe habit.
- **The component takes NO props.** It is rendered as `<App />` with nothing passed.
  Anything the UI needs must come from `useState`, constants you define in the block,
  or the `matrx` data SDK (below). Never rely on incoming props.
- **One component tree per block.** You may define helper components/functions above
  it; they all live in the same block. Never split one app across two fences.
- Never wrap the fence in `<artifact>` tags — the fence IS the artifact.

## When to use which shape

| User intent | What to build |
|---|---|
| A number the user tunes and sees results | Sliders/inputs + live computed output |
| Compare / explore tabular data | A `Table` with filter/sort state |
| Show a trend, proportion, or distribution | A `recharts` chart |
| Step-by-step or form input | `Input` / `Select` / `Checkbox` + `Button`, with state |
| A small tool or calculator | Inputs + derived state + result card |
| A tiny game or animation | State + `motion/react` (or an interval) |
| Show the user's own tasks in a custom UI | The `matrx.tasks` SDK (read-only) |

## What you can import / use (the allowlist — do not go outside it)

Imports are **stripped** and dependencies are injected from a fixed allowlist.
You may `import` from the paths below, OR just use the identifiers directly (they
are already in scope). Do NOT import anything else — an unknown import silently
becomes nothing.

**Always available (no import needed):**
- **React hooks:** `useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`,
  `useReducer`, `useContext`, `Fragment` (and `React`).
- **All Lucide icons** (e.g. `Check`, `TrendingUp`, `Plus`). An unknown icon name
  renders a neutral placeholder instead of crashing — so use real Lucide names.
- **`cn`** — the className merge helper.
- **`DynamicIcon`** — resolve any icon by string name: `<DynamicIcon name="Rocket" />`.
- **Curated shadcn UI components:** `Button`, `Badge`, `Input`, `Label`, `Textarea`,
  `Card` (+ `CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`),
  `Select` (+ parts), `Slider`, `Switch`, `Checkbox`, `RadioGroup` (+ parts),
  `Tabs` (+ parts), `Accordion` (+ parts), `Collapsible` (+ parts), `Progress`,
  `Separator`, `ScrollArea`, `Dialog` (+ parts), `Sheet` (+ parts),
  `DropdownMenu` (+ parts), `Popover` (+ parts), `Tooltip` (+ parts),
  `Table` (+ parts), `Avatar` (+ parts), `Alert` (+ parts), `Skeleton`.
- **`MarkdownStream`** — render markdown inside your component.

**Heavy libraries (available; load only when you reference them):**
- **`recharts`** — `ResponsiveContainer`, `LineChart`, `BarChart`, `AreaChart`,
  `PieChart`, `RadarChart`, `ScatterChart`, `ComposedChart`, `RadialBarChart`, axes,
  `Tooltip`, `Legend`, etc.
- **`motion/react`** — `motion`, `AnimatePresence`, `useAnimate`, `useInView`.
- **`react-katex`** — `BlockMath`, `InlineMath` (math typesetting).
- **`react-pdf`** — `Document`, `Page`, `Outline`.
- **`xlsx`** — the `XLSX` namespace (workbooks/spreadsheets).
- **`three`** + **`@react-three/fiber`** — `THREE`, `Canvas`, `useFrame`, `useThree`, `useLoader` (3D).
- **`date-fns`** — the `dateFns` namespace.
- **`lodash`** — the `_` namespace.

**Styling:** use Tailwind utility classes and the app's semantic tokens
(`bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `text-primary`,
`border-border`, `bg-accent`). This makes the component match light/dark theme
automatically. Do not inline brand hex colors for chrome; use tokens.

## The `matrx` data SDK (the user's own data, RLS-safe)

A `matrx` object is in scope. It runs as the current user through the browser and
is subject to row-level security — it can only read what the user can already see.
Current (read-only) surface:
- `await matrx.tasks.list()` — the user's tasks.
- `await matrx.tasks.get(id)` — one task.
- `await matrx.tasks.subtasks(id)` — a task's subtasks.

Call it inside `useEffect` and hold the result in `useState`. It is the only data
door — never try to reach a database, `fetch`, or network directly.

## Syntax rules that prevent compile/render failures

The block is only shown once it finishes streaming; if it fails to compile it
silently falls back to showing the code, so correctness matters. The real failure
classes:

- **No default export / no component returned** → nothing renders.
  - WRONG: `const x = 1;` (no component) or `function helper() {…}` only.
  - RIGHT: `export default function App() { return <div/>; }`.
- **Component expects props** → it renders with none and breaks.
  - WRONG: `export default function App({ items }) { return items.map(…) }`.
  - RIGHT: define `items` inside the component (constant, state, or `matrx`).
- **Importing something off the allowlist** → the identifier is undefined.
  - WRONG: `import confetti from "canvas-confetti";`
  - RIGHT: use only the modules listed above (e.g. `motion/react` for animation).
- **`require()` or dynamic `import()` in the code** → not allowed; both fail.
  - RIGHT: static `import { X } from "recharts"` (stripped, injected from scope),
    or just reference `LineChart` directly.
- **Server-only APIs** → this runs in the browser. No `fs`, no `process`, no
  Node built-ins, no direct `document.cookie`/secrets. Keep it pure client UI.
- **`"use client"` / `"use server"` directives** → unnecessary; they are stripped.
  Leave them out.
- **Unknown PascalCase component/icon** → becomes a placeholder, not your intent.
  Use real Lucide names and the exact UI component names listed above.
- **Charts need explicit size** → wrap `recharts` charts in a fixed-height parent
  (e.g. `<div className="h-64"><ResponsiveContainer>…`), or they collapse to 0px.

## Sizing / limits

- Keep a block to a single focused component — think one screen of UI, roughly
  under ~300 lines. If you need a whole multi-page app, that is agent-apps
  territory, not a chat react block.
- Prefer the always-available UI kit over reinventing widgets by hand.
- No external assets (no remote images/fonts/scripts). Use inline SVG or Lucide
  icons for graphics.

## Editing etiquette

When the user asks to change a rendered component:
- Return **ONE complete, updated** ```react block — the full component, not a diff
  or a fragment. The block re-compiles from scratch each time.
- **Keep the same fence type** (`react` / `jsx` / `tsx`) you used before.
- Preserve the parts the user did not ask to change; only alter what they requested.
- Stay inside the allowlist — do not introduce a new dependency to satisfy an edit.

## Minimal correct examples

Interactive control + derived output:

```react
export default function App() {
  const [rate, setRate] = useState(5);
  const monthly = Math.round((10000 * (rate / 100)) / 12);
  return (
    <Card className="p-4 space-y-3">
      <CardHeader><CardTitle>Interest estimator</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Label>Annual rate: {rate}%</Label>
        <Slider value={[rate]} min={0} max={20} step={0.5}
                onValueChange={(v) => setRate(v[0])} />
        <p className="text-sm text-muted-foreground">
          Monthly interest on $10,000: <span className="font-semibold text-foreground">${monthly}</span>
        </p>
      </CardContent>
    </Card>
  );
}
```

A chart (recharts, loaded on demand):

```react
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";

export default function App() {
  const data = [
    { month: "Jan", users: 120 }, { month: "Feb", users: 210 },
    { month: "Mar", users: 340 }, { month: "Apr", users: 520 },
  ];
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="month" /><YAxis /><Tooltip />
          <Line type="monotone" dataKey="users" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

Reading the user's own data via the SDK:

```react
export default function App() {
  const [tasks, setTasks] = useState([]);
  useEffect(() => { matrx.tasks.list().then(setTasks).catch(() => setTasks([])); }, []);
  return (
    <Card className="p-4">
      <CardHeader><CardTitle>My tasks ({tasks.length})</CardTitle></CardHeader>
      <CardContent className="space-y-1">
        {tasks.map((t) => (
          <div key={t.id} className="text-sm text-foreground">{t.title ?? "Untitled"}</div>
        ))}
      </CardContent>
    </Card>
  );
}
```
$BODY$,
  'Boxes',
  '["web"]'::jsonb,
  '1.0.0',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',
  true, true, 'public',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  NULL, NULL, 0
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'react-component' AND created_by IS NULL
);

-- ============================================================================
-- 2. Content blocks  ->  public.content_blocks
-- ============================================================================
-- block_id is UNIQUE -> ON CONFLICT (block_id) DO UPDATE. Reuses the shared
-- "Render Blocks" content-block category (6913d9fc…). Global org, NULL user/
-- project/task. version is an integer column.

-- 2a. Primary block: Live React Component (general).
INSERT INTO public.content_blocks (
  block_id, label, description, template, icon_name,
  organization_id, category_id, metadata, version, is_active, sort_order
) VALUES (
  'react-component',
  'Live React Component',
  'Emit a live, interactive React component that compiles and renders inline.',
  $CB$When a live, interactive UI communicates better than prose — a calculator, chart, form, or small tool — emit a ```react block that renders as a real React component:

```react
export default function App() {
  const [count, setCount] = useState(0);
  return (
    <Card className="p-4 flex items-center gap-3">
      <Button onClick={() => setCount((c) => c - 1)}>-</Button>
      <span className="text-2xl font-semibold">{count}</span>
      <Button onClick={() => setCount((c) => c + 1)}>+</Button>
    </Card>
  );
}
```

Rules:
- Always `export default` a component that takes NO props (it renders as `<App />`).
- Use only the allowlisted imports: React hooks, all Lucide icons, `cn`, the shadcn UI kit (Button/Card/Input/Select/Slider/Tabs/Table/…), `MarkdownStream`. No other packages, no `fetch`, no `require`.
- Style with Tailwind + semantic tokens (`bg-card`, `text-foreground`, `text-muted-foreground`).
- On edits, return ONE complete updated ```react block.$CB$,
  'Boxes',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '6913d9fc-b8c0-4107-af40-27d55c177694',
  '{}'::jsonb,
  1, true, 10
)
ON CONFLICT (block_id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  template = EXCLUDED.template,
  icon_name = EXCLUDED.icon_name,
  category_id = EXCLUDED.category_id,
  organization_id = EXCLUDED.organization_id,
  metadata = EXCLUDED.metadata,
  version = EXCLUDED.version,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- 2b. Sub-type: Interactive React Chart (recharts, demand-loaded).
INSERT INTO public.content_blocks (
  block_id, label, description, template, icon_name,
  organization_id, category_id, metadata, version, is_active, sort_order
) VALUES (
  'react-chart',
  'Interactive Chart',
  'Emit a live recharts chart inside a React component.',
  $CB$When the data is clearer as a live chart — a trend, proportion, or distribution — emit a ```react block using recharts:

```react
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";

export default function App() {
  const data = [
    { month: "Jan", users: 120 }, { month: "Feb", users: 210 }, { month: "Mar", users: 340 },
  ];
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="month" /><YAxis /><Tooltip />
          <Line type="monotone" dataKey="users" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

Rules:
- `export default` a NO-props component. Charts MUST sit in a fixed-height parent (e.g. `h-64`) or they collapse to 0px.
- recharts is allowlisted (LineChart/BarChart/AreaChart/PieChart/RadarChart + axes, Tooltip, Legend); no other chart libs.$CB$,
  'ChartLine',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '6913d9fc-b8c0-4107-af40-27d55c177694',
  '{}'::jsonb,
  1, true, 20
)
ON CONFLICT (block_id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  template = EXCLUDED.template,
  icon_name = EXCLUDED.icon_name,
  category_id = EXCLUDED.category_id,
  organization_id = EXCLUDED.organization_id,
  metadata = EXCLUDED.metadata,
  version = EXCLUDED.version,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- 2c. Sub-type: Interactive tool / calculator.
INSERT INTO public.content_blocks (
  block_id, label, description, template, icon_name,
  organization_id, category_id, metadata, version, is_active, sort_order
) VALUES (
  'react-tool',
  'Interactive Tool',
  'Emit a small interactive tool or calculator as a live React component.',
  $CB$When the user wants to tune inputs and see results update live — a calculator or small tool — emit a ```react block with state-driven controls:

```react
export default function App() {
  const [rate, setRate] = useState(5);
  const monthly = Math.round((10000 * (rate / 100)) / 12);
  return (
    <Card className="p-4 space-y-3">
      <Label>Annual rate: {rate}%</Label>
      <Slider value={[rate]} min={0} max={20} step={0.5} onValueChange={(v) => setRate(v[0])} />
      <p className="text-sm text-muted-foreground">Monthly on $10,000: <span className="font-semibold text-foreground">${monthly}</span></p>
    </Card>
  );
}
```

Rules:
- `export default` a NO-props component; hold every input in `useState`.
- Use the allowlisted UI kit (Slider/Input/Select/Switch/Button/Card); no external packages.
- Derive outputs from state so the result updates as the user interacts.$CB$,
  'Calculator',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '6913d9fc-b8c0-4107-af40-27d55c177694',
  '{}'::jsonb,
  1, true, 30
)
ON CONFLICT (block_id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  template = EXCLUDED.template,
  icon_name = EXCLUDED.icon_name,
  category_id = EXCLUDED.category_id,
  organization_id = EXCLUDED.organization_id,
  metadata = EXCLUDED.metadata,
  version = EXCLUDED.version,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

COMMIT;
