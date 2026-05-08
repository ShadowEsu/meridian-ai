# Meridian frontend workflow

One page at a time. Three tools, four steps. No tool gets used outside its lane.

| Tool | Lane |
|---|---|
| **Stitch** (Google) | Visual exploration only — pick a direction |
| **ui-ux-pro-max** | Design *rules* — tokens, contrast, anti-patterns |
| **shadcn/ui** blocks | Component source for things `src/` doesn't already have |

Anchor doc: [`docs/DESIGN_STITCH.md`](../DESIGN_STITCH.md) — the system-wide aesthetic. This workflow refines one page within that system.

---

## Step 0 — Init the page

```bash
scripts/design-page.sh <page-name>
```

Creates `docs/design/<page-name>/` and runs the design-system CLI persisting to `design-system/meridian/pages/<page-name>.md`.

---

## Step 1 — Diverge in Stitch

Goal: 2–3 visual variants. Pick one. *Do not* code from these — they're for direction only.

1. Open <https://stitch.withgoogle.com/>, paste the prompt template below, swap `{PAGE_DESCRIPTION}`.
2. Generate 2–3 variants. Iterate with voice/vibe ("show me with denser tables", "two columns instead of three").
3. Export the chosen variant's `DESIGN.md` and screenshots → save to `docs/design/<page-name>/`.

**Prompt template:**
```
Meridian — AI cost & operations dashboard for engineering and finance teams.
Aesthetic: editorial-dark glass, Crimson Pro serif headings + Manrope body,
tabular numerals, indigo (#6366F1) accent, no decorative gradients.
Reference: Perplexity Pro, Linear, Vercel dashboard.

Page: {PAGE_DESCRIPTION}

Constraints:
- Dark mode only (#0A0A0B background).
- Real data density: this is for power users, not a marketing page.
- WCAG AA contrast (4.5:1 minimum text).
- All touch targets >= 44px.
```

---

## Step 2 — Lock the rules (text)

After Step 0 you have `design-system/meridian/pages/<page-name>.md` with auto-generated rules. **Hand-edit it** to capture what's specific from your Stitch pick:

- Grid choice (3-up vs 2-up vs 4-up)
- Component density (compact / comfortable / spacious)
- Page-only color overrides
- Anti-patterns observed in the variants you rejected

Keep it under 100 lines. If it's longer, you're encoding too much.

---

## Step 3 — Source components

For each pattern the page needs, in order:

1. **Already in `src/`?** Reuse it. (`KPI card`, `header`, `nav` are all built.)
2. **shadcn/ui blocks?** Copy in: <https://ui.shadcn.com/blocks>. Adapt tokens to Meridian's CSS variables.
3. **Novel?** Build from scratch following the rules from Step 2.

Skip 21st.dev unless shadcn doesn't have it — free tier burns out in one component.

---

## Step 4 — Build + verify

1. Edit the page JSX (`src/pages/<page>.jsx`).
2. Verify in Playwright at three widths (1440 / 768 / 390):
   ```bash
   PORT=3717 npm start &
   python3 scripts/verify-design.py <page-name>   # see template below
   kill %1
   ```
3. Manual check against the rules from Step 2: contrast, focus rings, touch targets, mobile reflow.
4. Commit only the page-specific files. Reference the page name in the commit subject.

---

## Folder layout

```
meridian/code/MeridianCode/
  design-system/
    meridian/
      MASTER.md              # global rules (created by Step 0 first run)
      pages/
        overview.md          # per-page overrides (created by Step 0)
        keys.md
        ...
  docs/
    DESIGN_STITCH.md         # system-wide aesthetic doc (already exists)
    design/
      WORKFLOW.md            # this file
      <page-name>/
        DESIGN.md            # Stitch export
        variant-1.png        # rejected
        variant-2.png        # picked
        variant-3.png        # rejected
        notes.md             # why you picked variant 2
  scripts/
    design-page.sh           # Step 0 helper
```

---

## When to skip the workflow

- **Bug fixes** — just fix it. The workflow is for new design, not maintenance.
- **One-line CSS tweaks** — same.
- **Cross-page changes** (e.g. shared `.btn` style) — those go in `styles.css` directly and follow the system-wide doc, not a per-page file.

---

## Time budget per page

| Step | Target |
|---|---|
| 0 + 1 (Stitch + init) | 30–45 min |
| 2 (lock rules) | 15 min |
| 3 (sourcing) | 30 min |
| 4 (build + verify) | 2–4 hours |

If you exceed 6 hours on a single page, stop and re-scope — the page is too ambitious or the rules are wrong.
