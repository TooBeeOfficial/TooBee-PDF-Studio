# TooBee PDF Studio — Visual Direction: **Workbench**

Global source of truth for the redesign. Page-specific overrides live in `./pages/<route>.md`
and take precedence over anything here.

---

## 1. The thesis

A PDF is a stack of pages. Every single operation in this app is some answer to
*which pages*, *in what order*, *at what quality*. The current build hides that stack
behind forms — you upload into a card, fill in a text field, and hope. **Workbench inverts
it: the document is always on screen, and the controls are instruments sitting beside it.**

The app should feel like Affinity or Figma, not like a web wizard. Dense, opaque, quiet,
built for someone who has the window open all day.

---

## 2. Signature element — the page filmstrip

> **STATUS: not built.** The project carries a standing constraint that no function
> which loads, parses, converts or writes PDFs may be modified. The filmstrip cannot
> be built within it: thumbnails need new `pdfjs` render code, and even the reduced
> version — numbered page chips — needs a page count that only exists inside the
> PDF-loading functions. It was deferred rather than worked around.
>
> The stage/inspector layout below is built and leaves room for the strip to drop in
> later without redoing any page. The rest of this section is the design as intended,
> kept for whenever the constraint is lifted.
>
> **Consequence:** the tools are consistent in appearance but remain independent —
> page selection is not shared, and each tool still asks for its pages in its own way.
> That was the single idea meant to make twelve tools feel like one application.

The one thing this app will be remembered by.

An 84px strip pinned to the bottom of every tool page showing the loaded document's page
thumbnails, with the filename and byte size set in mono. Thumbnails render at a fixed low
scale, with only the first 30 drawn up front and the rest filling in as the strip is
scrolled. It is not decoration — it is the
**universal page-selection input**. Clicking thumbnails selects pages, and that selection
lives in `useToolStore`, shared across every tool. Select pages 3–5 in Rotate, switch to
Extract, and they are still selected.

That shared selection is the risk being taken. It makes twelve tools behave like one
application instead of twelve tabs. Split's "page range" text field, Rotate's "apply to"
radio group, and Extract's page picker all collapse into the same gesture.

When no document is loaded the strip collapses to a 28px status bar reading `No document`.

Everything else in the design stays quiet so this can be the loud thing.

---

## 3. Layout — three zones over a strip

```
┌────────┬──────────────────────────────────┬─────────┐
│  RAIL  │             STAGE                │INSPECTOR│
│ 220px  │        (flex, the document)      │  300px  │
│        │                                  │         │
│        │                                  │         │
│        │                                  │─────────│
│        │                                  │ primary │
├────────┴──────────────────────────────────┴─────────┤
│  FILMSTRIP  84px                                    │
└─────────────────────────────────────────────────────┘
```

- **Rail** — 220px (down from 240). Grouped nav, 11px uppercase group labels, 13px items.
  Settings pinned to the bottom above a theme toggle.
- **Stage** — the document preview. Always the largest element on the page. Owns its own
  zoom/scroll. Never competes with controls for width.
- **Inspector** — 300px right dock holding that tool's controls, with the primary action
  button pinned to its bottom edge so it is always in the same place on every page.
- **Filmstrip** — the signature, above.

Tools that genuinely have no document to show (Merge's queue, Convert's output grid)
put their content in the Stage and keep the Inspector for options.

**Page header** collapses from the current 2-row block into a single 48px bar:
tool name at 15px/600 on the left, document actions on the right. The descriptive
sentence under each title is cut — it is read once and then wastes vertical space forever.

---

## 4. Color

Near-black + amber is kept, as briefed. What changes is that surfaces become **opaque and
stepped** instead of translucent, and both themes get fixed contrast.

### Dark (default face)

| Token | Value | Use |
|---|---|---|
| `--surface-app` | `#0B0B0D` | window background |
| `--surface-chrome` | `#101014` | rail, header bar, filmstrip |
| `--surface-panel` | `#16161B` | inspector, cards |
| `--surface-raised` | `#1D1D23` | inputs, nested cards, hover |
| `--surface-stage` | `#131318` | document stage behind pages |
| `--line` | `#26262E` | hairline borders |
| `--line-strong` | `#3A3A45` | dividers that must read |
| `--text` | `#F2F2F3` | primary |
| `--text-dim` | `#A0A0AC` | secondary |
| `--text-faint` | `#6F6F7C` | tertiary, disabled |

### Light

Warm paper, not cool gray — a cool gray ground makes the amber read acidic.

| Token | Value | Use |
|---|---|---|
| `--surface-app` | `#F7F6F3` | window background |
| `--surface-chrome` | `#FFFFFF` | rail, header bar, filmstrip |
| `--surface-panel` | `#FFFFFF` | inspector, cards |
| `--surface-raised` | `#F1EFEA` | inputs, nested cards, hover |
| `--surface-stage` | `#E8E6E0` | document stage behind pages |
| `--line` | `#E2DFD8` | hairline borders |
| `--line-strong` | `#CFCBC2` | dividers that must read |
| `--text` | `#17171A` | primary |
| `--text-dim` | `#5C5C66` | secondary |
| `--text-faint` | `#8A8A93` | tertiary, disabled |

### Accent — both themes

| Token | Dark | Light | Use |
|---|---|---|---|
| `--amber` | `#D0A700` | `#D0A700` | fills, active states, focus ring |
| `--amber-hover` | `#E8BC0A` | `#BC9600` | hover on filled |
| `--amber-text` | `#D0A700` | `#8A6F00` | amber used **as text or icon** |
| `--on-amber` | `#14120A` | `#14120A` | text sitting **on** an amber fill |
| `--amber-wash` | `rgba(208,167,0,.12)` | `rgba(208,167,0,.14)` | active nav, selected page |

**Two contrast bugs this fixes.** `.btn-primary` currently sets `color: white` on
`#D0A700` — that is **2.3:1**, a clear WCAG failure on the most-clicked control in the app.
It becomes `--on-amber` at **8.2:1**. And light mode's `#b08d00` on white is **3.17:1**,
also failing; `--amber-text` at `#8A6F00` gives **4.82:1**.

### Semantic

Muted deliberately so they sit beside amber instead of fighting it.

`--ok #3DA35D` · `--danger #D6453D` · `--info #4A8FD4`
Each gets a `-wash` at 12% for backgrounds. Never carry meaning by color alone —
every status pairs a color with an icon and a word.

---

## 5. Typography — Public Sans + Spline Sans Mono

Both **self-hosted as woff2 in `src/assets/fonts/`** — not `public/`, because Vite is
configured with `base: "./"` and public-dir assets would emit absolute `/fonts/...` URLs
that break under `file://` in the packaged app. From `src/` they are hashed and rewritten
relative to the stylesheet. The Google Fonts `<link>` in `index.html` is gone: a packaged
Electron app has no guaranteed network, and it used to fall back to Segoe UI offline.

Both faces are **variable**, so one file per subset covers every weight — four files,
about 100 KB total.

**Neither covers Greek or CJK.** Their subsets are latin, latin-ext and vietnamese only,
while the app ships `el`, `ja` and `zh` locales. Turkish, Spanish and Italian are covered by
latin-ext. Greek and CJK fall through to a per-script fallback stack (Segoe UI, then Yu
Gothic UI / Meiryo / Microsoft YaHei UI), which is declared explicitly in `--font-ui` rather
than left to the browser default.

- **Public Sans** (400/500/600/700) — all UI text. The US Web Design System's grotesque:
  exceptionally legible at small sizes, genuinely underused, and with no quirks that get
  tiring in an app you keep open for hours.
- **Spline Sans Mono** (400/500) — **every number**. Page counts, byte sizes, percentages,
  page ranges, dimensions, coordinates, zoom levels. Tabular figures so values don't
  jitter as they update.

Splitting numerics into mono is what makes the app read as an instrument. It is a rule,
not a suggestion: if it is a quantity, it is mono.

### Scale — desktop density, not web

| Role | Size / weight | Notes |
|---|---|---|
| Stage title | 20 / 600 | tool name in header bar |
| Section head | 15 / 600 | inspector group titles |
| Body & controls | 13 / 400 | the workhorse size |
| Label | 12 / 500 | field labels |
| Eyebrow | 11 / 600, `letter-spacing .08em`, uppercase | nav group labels, inspector sections |
| Micro | 11 / 400 | filmstrip meta, hints |
| Numeric | mono, matches its context size, 500 | all quantities |

Line-height 1.45 for body, 1.2 for headings. No text below 11px anywhere.

---

## 6. Material rules

**Zero glassmorphism.** Every `backdrop-filter` is deleted — sidebar, `.glass`, cards, and
the settings modal overlay. The `--glass-bg` / `--glass-border` tokens are removed
entirely rather than redefined, so nothing can quietly keep using them.

Depth comes from three things only:

1. **Opaque fills stepping one level per nesting** — `app → chrome → panel → raised`.
2. **1px hairlines** at `--line`.
3. **Exactly one shadow token**, `--shadow-modal`, used only by the settings modal and
   the filmstrip's top edge. Cards get no shadow at all.

Radii: `--r-sm 4px` (inputs, small buttons) · `--r-md 6px` (cards, panels) ·
`--r-lg 10px` (modal). Nothing rounder — soft pills read consumer, and this is a tool.

Spacing scale, dense: `4 · 8 · 12 · 16 · 24 · 32 · 48`.

---

## 7. Motion

Restrained to the point of near-invisibility. This is a utility; motion here is feedback,
not personality.

- Color/background transitions: **120ms** `ease-out`
- Panel and disclosure transitions: **180ms** `cubic-bezier(.2,0,0,1)`
- Route change: **140ms opacity-only crossfade**. The current `x: 10 → 0` slide is dropped —
  it fights the fixed rail and makes the whole app twitch on every navigation.
- Filmstrip thumbnail selection: instant fill, no transition. Selection must feel mechanical.
- Progress: a determinate bar in the inspector. No indeterminate shimmer anywhere.

**All of it is CSS.** `framer-motion` is removed from the project entirely — all 16
`motion.*` elements across 7 files become CSS transitions and keyframes. The motion above
is sparse enough that a 50KB library and its rAF loop buy nothing, and dropping it means
the animation budget is a stylesheet rather than a runtime.

`@media (prefers-reduced-motion: reduce)` sets every duration to `0.01ms` and disables the
route crossfade, independently of the performance tier below.

---

## 7b. Performance tiers

The app must stay usable on old, slow machines. One build, three tiers, switched at runtime
from Settings under **Performance**. The tier is stored in `localStorage` as `toobee.perf`
and exposed through a `data-perf` attribute on `<html>` so CSS can respond without JS.

### What the tiers can and cannot reach

The substantial runtime savings on a weak machine all live in the PDF render loop —
canvas retention, render concurrency, zoom re-render scheduling. **That code is off-limits
under the project's standing constraint** that no function which loads, parses, converts or
writes PDFs may be modified. The tiers therefore cannot touch it. What remains reachable is
the animation layer, and the tiers are honest about being only that.

| | **Full** | **Light** | **Minimal** |
|---|---|---|---|
| Hover / focus transitions | yes | yes | **none** |
| Entrance animations (route change, dialog open) | yes | **none** | **none** |
| Looping animations (spinners, page shimmer) | yes | **none** | **none** |
| Render DPI, canvas retention, render scheduling | untouched | untouched | untouched |

**Light** removes the two costs that recur: animations that loop forever, and the entrance
animation that replays on every navigation. The page shimmer in particular runs an infinite
keyframe animation for as long as a page is rasterising. Short hover and focus transitions
stay, because they are what makes a control feel like it responded.

**Minimal** sets every `transition-duration` and `animation-duration` to `0`. The same app
with the clock removed.

All three are one CSS block keyed on `[data-perf]`, so no component branches on the tier.
`prefers-reduced-motion` is handled separately and still applies at any tier.

**Render DPI is not capped in any tier**, by choice as well as by constraint. Capping to 1x
is the biggest speedup available, but it visibly softens every preview on a high-DPI
display, and this is a document tool where "does this look right" is the whole job.

### Deferred, and why

Recorded so the reasoning is not lost. None of these are blocked by difficulty.

- **Render-loop work** — canvas eviction for off-screen pages, a one-deep render queue,
  debounced zoom re-render, a stricter intersection threshold. All four are lossless
  (scheduling and memory, not fidelity) and would be the real win for old hardware. All
  four live inside PDF-handling code.
- **Lazy-loading the converters.** `mammoth`, `xlsx` and `html2canvas` are imported eagerly
  at the top of `utils/fileConverter.ts`, which nearly every page imports, so all three
  parse at startup even in a session that only ever touches PDFs. Converting them to
  dynamic `import()` means editing those functions' imports. This is the cheapest large win
  still on the table.
- **Full framer-motion removal.** Removed from `App.tsx`, `Home`, `Split` and `Rotate`;
  still present in `Edit`, `Sign` and the unrouted `ExtractText`, where it drives canvas
  drag interactions that need real reimplementation rather than a substitution. The
  dependency therefore still ships.


### Detection

On first launch only, sample `navigator.hardwareConcurrency`, `navigator.deviceMemory`, and
the duration of two `requestAnimationFrame` ticks. If the machine looks weak, show a single
dismissible bar above the stage:

> This machine may run better in Light mode.  **[Switch to Light]  [Keep Full]**

Never auto-apply. A wrong guess would silently hand someone a degraded app with no
explanation, and the detection signals are only indicative. The choice is recorded either
way so the bar never appears twice.

---

## 8. Theme behavior

- Boots from `matchMedia('(prefers-color-scheme: dark)')`.
- Settings offers three states: **System · Light · Dark**.
- Choice persists to `localStorage` under `toobee.theme`; `System` re-follows the OS and
  keeps listening to `matchMedia` changes for the life of the session.
- Applied as `data-theme="light"` / `"dark"` on `<html>`, always explicit — never left unset,
  so no component has to guess.
- A blocking inline script in `index.html` sets the attribute before first paint to kill the
  white flash on launch.
- `color-scheme` is set per theme so native scrollbars, form controls, and the Electron
  window chrome follow.

**Light mode gets genuinely finished.** These currently hardcode dark values and ignore the
light theme entirely: `.pdf-preview-container` (`#1e293b`), `.dropzone:hover` (white
overlays), `.main-content`'s radial gradients, `.resize-handle`'s white ring, and the
settings modal scrim.

---

## 9. Component decisions

- **Buttons** — three variants only: `primary` (amber fill, `--on-amber` text),
  `secondary` (raised fill, hairline), `ghost` (transparent, hover fill). Icon-only buttons
  are 32×32 minimum with a real `aria-label` and a tooltip. Height 32px default, 28px compact.
- **Focus** — `outline: 2px solid var(--amber); outline-offset: 2px` on `:focus-visible`,
  globally, never removed.
- **Inputs** — `--surface-raised` fill, hairline border, amber border on focus. Labels are
  always visible above the field; placeholders never substitute for a label.
- **Dropzone** — dashed hairline over `--surface-raised`, amber border and wash when active.
  The three fake badges ("Secure", "Privacy First") on the current dropzone are cut; the
  claim already lives on the dashboard and repeating it is noise.
- **Tool cards (dashboard)** — the eleven per-tool hex colors are dropped. Every icon renders
  in `--text-dim`, going amber on hover. Eleven unrelated hues is a rainbow, not a system,
  and it makes amber meaningless as a signal.
- **Modal** — opaque `--surface-panel`, `--r-lg`, `--shadow-modal`, plain `rgba(0,0,0,.55)`
  scrim with no blur. Focus trapped, `Esc` closes, focus returns to the trigger.

---

## 10. Copy

Present tense, active voice, sentence case, and the same verb from control to confirmation —
the button that says **Split** produces a status that says **Split**, not "Success!".

Rename for what the user controls, not what the code does: "Advanced Multi-Split" becomes
**Split**; "Generate 3 Split Files" becomes **Split into 3 files**. Empty states say what to
do next ("Open a PDF to start"), never just what is missing. Errors say what happened and how
to fix it, and they appear next to the thing that failed — the current `alert()` calls in
Split, Merge, and Rotate are replaced by inline inspector errors.

---

## 11. Pre-delivery checklist

- [ ] No `backdrop-filter` anywhere in the codebase
- [ ] No `color: white` on amber fills
- [ ] Light mode: every text pair ≥ 4.5:1; no hardcoded dark hexes left
- [ ] `:focus-visible` ring on every interactive element
- [ ] All quantities set in Spline Sans Mono
- [ ] Fonts self-hosted; no network request on launch
- [ ] `prefers-reduced-motion` honoured, independently of the performance tier
- [ ] Icon-only buttons have `aria-label`
- [ ] Theme persists across restart and `System` still tracks the OS
- [ ] Window usable down to 1000×700 (the Electron minimum, `electron/main.ts`)
- [ ] Minimal tier: no element animates, confirmed with the DevTools animation inspector
- [ ] Light tier: no looping animation runs while a page rasterises
- [ ] Performance tier persists across restart; detection hint appears at most once
- [ ] Greek, Japanese and Chinese UI text render through the fallback stack without tofu

Blocked by the no-PDF-code constraint, not yet done:

- [ ] `framer-motion` gone from `package.json` (still used by Edit, Sign, ExtractText)
- [ ] `mammoth` / `xlsx` / `html2canvas` absent from the startup bundle
- [ ] Legacy token alias block deleted from `index.css` (needs Edit, Sign, PdfPreviewer,
      Annotate and ExtractText migrated first)
- [ ] `backdrop-filter` gone from `PdfPreviewer.tsx` and `Edit.tsx`
