# Design System Master File — DEPRECATED

> ⚠️ **Superseded by [`DESIGN.md`](./DESIGN.md) (canonical) as of 2026-05-31.**
>
> The color, typography, and component specs that used to live here were
> auto-generated (2026-05-08) and are **stale** — they specified a light
> `#F8FAFC` / Fira Code palette that matches **neither** the new marketing
> homepage (`landing/`, Apple-style light + Action Blue `#0066cc`, SF Pro) **nor**
> the running dashboard (`src/styles/styles.css`, OLED-dark + indigo `#7079E8`,
> Inter Tight / Geist Mono). They were also internally contradictory (light
> tokens + "Style: Dark Mode (OLED)" + "anti-pattern: light mode default").
>
> **For tokens, type, color, components, and layout, read `DESIGN.md`.** It is the
> single source of truth and it matches the homepage 1:1.
>
> Dashboard note: the live app at `/app` still ships the OLED-dark language. Bringing
> it onto `DESIGN.md` is the tracked "phase the app" migration — not yet done.

The page-override convention still holds: a `design-system/meridian/pages/<page>.md`
file, if present, overrides the canonical rules for that page.

---

## Universal UI checklist (design-agnostic — still valid)

These rules are independent of the visual language and apply to any surface:

- [ ] No emojis used as icons — use SVG (Heroicons / Lucide / Simple Icons)
- [ ] Icons from one consistent set
- [ ] `cursor: pointer` on all clickable elements
- [ ] State changes use transitions (150–300ms); no instant jumps
- [ ] Text contrast ≥ 4.5:1
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive at 390 / 768 / 1024 / 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
- [ ] No layout-shifting hovers (avoid transforms that reflow)
