# Marketing Landing Page — Plan

**Status:** ✅ done / superseded 2026-05-31 — realized as `landing/index.html` +
`landing/meridian-home.css`, served at `/` (dashboard moved to `/app`). NOTE: the shipped
design is a **light Apple-style** language (`design-system/meridian/DESIGN.md`), not the
dark dashboard-token inheritance this plan originally assumed. The section list / copy
notes below are historical reference.

## Why this exists

Right now the app only has the authenticated product surface (`/` dashboard + `/auth`). A first-time visitor lands directly on the auth wall or the demo dashboard with no narrative pitch. We need a public marketing page that converts cold traffic into signups before the auth gate.

Distinct from:
- `Meridian.html` — authenticated SPA dashboard
- `src/pages/auth.jsx` — login / signup

## Conversion job

A visitor arrives via Twitter / HN / Anthropic Fellows demo link. In ≤8 seconds they need to understand:
1. What it is (AI router that picks cheaper models when quality survives)
2. Why it matters (concrete $ saved on a typical fleet)
3. How it works (one live demo widget proving it works)
4. How to start (Continue with Google, one click)

Goal: ≥6% visit → signup conversion.

## Sections (draft order, scrolls top-down)

1. **Hero** — full-viewport
   - Animated routing graph as background (live MLP making decisions on rotating sample prompts — pulled from the existing `src/pages/router.jsx` idiom, but bigger, more cinematic, with the cost saved per route ticking up in a corner counter)
   - Single-line headline + sub
   - Two CTAs: `Try the router` (scrolls to live demo widget) + `Get started` (auth)

2. **Problem framing** — "You're paying for Opus when Haiku would have shipped the same output."
   - Scroll-driven animation: a fleet of prompt tiles streams in, all routed to Opus → counter ticks up cost
   - On scroll: rerouted tiles peel off to cheaper tiers, counter resets, savings counter starts climbing
   - This is the emotional beat

3. **Live MLP demo widget** (the proof)
   - Embedded version of `MlpPlayground` (from `src/pages/router.jsx`)
   - Pre-populated with 3 tabs of canned prompts (cheap / mid / premium examples) — visitor clicks, sees live tier prediction with confidence bar
   - Same `/api/router/preview` endpoint, no auth needed
   - "This is the actual model. Not a marketing animation."

4. **How it works** — 3-step horizontal scroll-snap
   - Step 1: Drop in OpenRouter / Anthropic / OpenAI key
   - Step 2: Replace your `https://api.openai.com/v1` with `https://meridian.ai/v1`
   - Step 3: Watch the dashboard fill with traffic, routing decisions, and savings

5. **Savings calculator** (interactive)
   - Sliders: monthly LLM spend ($), % of traffic that's "obviously cheap" prompts
   - Outputs projected monthly savings + payback period
   - Built on the same logic as the dashboard's Savings Vault SVG (reuse the bank illustration from `src/pages/router.jsx::SavingsBank`)

6. **What you get** — feature grid (4-6 tiles)
   - MLP router · usage analytics · provider-key vault · spend alerts · audit log · GDPR-EU routing
   - Each tile: tiny SVG icon + one-sentence value prop + link into the dashboard demo

7. **Comparison table** — Meridian vs. raw OpenRouter vs. building it yourself
   - Honest. Don't oversell.

8. **Social proof** (when we have it — placeholder for now)
   - Anthropic Fellows mention, design partners, logos

9. **Pricing** (or "free during alpha — paid tiers TBD")

10. **FAQ** — collapsible
   - "What models do you support?" "What about latency?" "Do you proxy or just decide?" "Is my data sent through your servers?" "Can I self-host?"

11. **Final CTA** — Continue with Google + email capture for the changelog

12. **Footer** — minimal: docs · github · email · privacy

## Animation grammar (reuse from app)

- **Easing:** `cubic-bezier(0.16, 1, 0.3, 1)` everywhere
- **Tokens / hexes:** see `src/styles/styles.css` — `--bg #0C0D10`, `--indigo #7079E8`, `--green #3FB37F`, etc.
- **Fonts:** Inter Tight (display + sans), Geist Mono (data + microcopy)
- **Backgrounds:** dot-grid `radial-gradient(rgba(255,255,255,0.05) 1px, transparent 0)` at 24px
- **Motion idiom from product:** tokens flowing along bezier curves between provider nodes and a central "Meridian" hub (steal from `src/pages/router.jsx::PageRouter`)
- **Numbers:** `font-variant-numeric: tabular-nums`, indigo glow on counter ticks
- **Scroll-driven:** use Intersection Observer or `scroll-timeline` (Chrome/Safari native, polyfill for Firefox). Avoid heavy GSAP unless we're already using it.

## Tech notes

- **Where it lives:** suggest `landing/` at repo root, served at `/` when unauthenticated. Move current `Meridian.html` mount to `/app` or behind auth-gate redirect.
- **Build:** single HTML + CSS + lightweight React (or static, if we want fast LCP). Same JSX-via-`@babel/standalone` pipeline as the dashboard, or compile statically.
- **SEO:** server-render the hero copy. `<title>`, OG tags, JSON-LD schema for SoftwareApplication.
- **Performance budget:** LCP <1.2s, CLS <0.05, total page <200KB gzipped without the demo widget chunk.
- **Demo widget chunk:** lazy-load the MLP playground React island after first scroll.

## Decisions deferred to Aadi

- Brand voice for marketing copy (use the `humanizer` skill once we have draft copy)
- Whether to show pricing now or "request beta access" gate
- Which design partner / customer logos to use (if any)
- Domain for the landing page vs. the app (`meridian.ai/` vs. `app.meridian.ai/`)
- Whether to commission an illustration system or stay with SVG-coded animations

## When to start

After: Supabase random-data seed + real-world router trial finishes (current next-up task). Landing page benefits from having concrete savings numbers to quote.

## Related

- Visual language source: `src/pages/router.jsx`, `src/pages/intelligence.jsx`, `src/styles/styles.css`
- Existing prompt for auth-page redesign: see chat history 2026-05-18 (paste-into-design-tool block)
- Conversion patterns: see `copywriting`, `landing-page-generator`, `seo-audit` skills in `~/.claude/`
