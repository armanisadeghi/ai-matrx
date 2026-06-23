# Glass CSS Migration History

## The Snapshot to Know: `a6b46613c` (2026-05-01)

This commit is the last clean state **before** the glass consolidation series.
At this point `styles/shell.css` contained **two completely independent glass systems** with different visual properties:

---

## System 1 — Shell Glass (panels, dock, chrome)

Tokens in `styles/shell.css` `:root` block:

```css
--shell-glass-bg:           rgba(210, 225, 255, 0.14);
--shell-glass-bg-hover:     rgba(210, 225, 255, 0.22);
--shell-glass-bg-active:    rgba(210, 225, 255, 0.32);
--shell-glass-border:       rgba(180, 205, 255, 0.40);   /* 40% opacity */
--shell-glass-border-width: 2.5px;
--shell-glass-card-bg:      rgba(220, 230, 255, 0.18);
--shell-glass-blur:         16px;
--shell-glass-shadow:       0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
--shell-glass-shadow-lg:    0 4px 16px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04);
```

Dark mode overrides:

```css
--shell-glass-bg:        rgba(180, 200, 255, 0.05);
--shell-glass-bg-hover:  rgba(180, 200, 255, 0.09);
--shell-glass-bg-active: rgba(180, 200, 255, 0.13);
--shell-glass-border:    rgba(255, 255, 255, 0.07);
--shell-glass-card-bg:   rgba(255, 255, 255, 0.06);
--shell-glass-shadow:    0 1px 3px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.12);
--shell-glass-shadow-lg: 0 4px 16px rgba(0,0,0,0.25), 0 2px 6px rgba(0,0,0,0.12);
```

Used by: `.shell-glass`, `.shell-glass-dock`, `.shell-glass-sheet`, `.shell-glass-card`

What made it unique: **16px blur** + `saturate(1.8) brightness(1.1)`. Thick frosted-glass look suitable for large surfaces (dock strip, side panels, sheets).

---

## System 2 — Matrx Glass (interactive buttons, pills)

Separate tokens in `styles/shell.css` `:root` block — **fully independent, zero dependency on `--shell-glass-*`**:

```css
--matrx-glass-bg:           rgba(210, 225, 255, 0.14);
--matrx-glass-bg-hover:     rgba(210, 225, 255, 0.22);
--matrx-glass-bg-active:    rgba(210, 225, 255, 0.32);
--matrx-glass-border-color: rgba(180, 205, 255, 0.70);   /* 70% opacity — KEY DIFFERENCE */
--matrx-glass-border-width: 1.5px;                        /* thinner — KEY DIFFERENCE */
--matrx-glass-blur:         4px;                          /* subtle — KEY DIFFERENCE */
--matrx-glass-shadow:       0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
--matrx-glass-shadow-lg:    0 4px 16px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04);
```

Dark mode overrides:

```css
--matrx-glass-bg:           rgba(180, 200, 255, 0.05);
--matrx-glass-bg-hover:     rgba(180, 200, 255, 0.09);
--matrx-glass-bg-active:    rgba(180, 200, 255, 0.13);
--matrx-glass-border-color: rgba(255, 255, 255, 0.07);
--matrx-glass-shadow:       0 1px 3px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.12);
--matrx-glass-shadow-lg:    0 4px 16px rgba(0,0,0,0.25), 0 2px 6px rgba(0,0,0,0.12);
```

Classes:

```css
.matrx-shell-glass          /* full glass pill — background + blur + border + shadow */
.matrx-glass-thin-border    /* same as above, identical values, used for group backdrops */
.matrx-glass-core           /* 3.5px border variant (rare) */
.matrx-glass-interactive    /* hover/active fills ONLY — for buttons inside a glass container */
.matrx-glass-fx             /* backdrop-filter only (no bg, no border) */
.matrx-glass-bg             /* background fill only */
.matrx-glass-border         /* border only */
.matrx-glass-shadow / -lg   /* shadow only */
```

What made it unique: **4px blur** (not 16px), **1.5px border** (not 2.5px), **70% border opacity in light mode** (not 40%). This is what makes the border look like a *light-refraction effect* rather than a colored line. On a small 30px pill the 40%-opacity 16px-blur combo looks wrong — too opaque and too blurry.

---

## The Migration Series (all 2026-05-01)

| Commit | Description |
|---|---|
| `a6b46613c` | Last clean state — both systems intact in `styles/shell.css` |
| `b03391324` | Migrated `matrx-shell-glass` → `shell-glass` (claimed byte-identical, was not) |
| `5113def9a` | Hoisted `shell-glass` tokens + classes to `globals.css` |
| `9023c8842` | Deleted legacy `mx-glass-*` and `matrx-glass-*` CSS |

The bug introduced in `b03391324`: when `matrx-shell-glass` was merged into `shell-glass`, it inherited `--shell-glass-border` (40% opacity, 2.5px) instead of the original 70% opacity, 1.5px values. The comment said "byte-identical" — it was not.

---

## Where Application Scope Matters

`styles/shell.css` was loaded **only** by:
- `app/(a)/layout.tsx`
- `app/(dev)/layout.dev.tsx`

`app/globals.css` is loaded by the root `app/layout.tsx` — it applies everywhere.

After the migration, all glass classes are in `globals.css` which is fine for breadth. The ordering concern is: CSS rules at the **bottom** of a large file can be silently dropped by some build tools or browser DevTools if the file exceeds certain size limits. As of the migration `globals.css` is ~1712 lines and the glass classes live around **line 1650–1690**. If the file grows much larger, classes near the end may need to be moved to a separate `app/glass.css` and imported separately.

---

## Reference File

`app/shell-original-a6b46613c.css` — full verbatim copy of `styles/shell.css` at commit `a6b46613c`.
Use this as the canonical reference if any glass value needs to be verified.
