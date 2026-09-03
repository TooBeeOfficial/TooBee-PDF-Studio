# Workbench — scored against the $10K Checklist

Metics Media *Field Guide No. 01* applied to what actually shipped in the redesign.

Caveat worth stating up front: this is a self-assessment of my own work, and the checklist
is written for **websites** while this is a **desktop utility**. Where a criterion doesn't
transfer literally (imagery), I've scored the nearest honest equivalent rather than awarding
a free pass or a zero.

**Criterion 07 (mobile) is excluded.** TooBee PDF Studio is a Windows desktop application;
phone and tablet layouts are not a use case. Scored out of 70 rather than 80.

**Overall: 44 / 70.** Solid engineering, incomplete design. The two criteria the checklist
treats as the difference between taste and competence — point of view, and hierarchy — are
the two weakest scores.

| # | Criterion | Score |
|---|---|---|
| 01 | Point of view, not a template | 6 / 10 |
| 02 | Typography that does work | 6 / 10 |
| 03 | A restrained color system | **8 / 10** |
| 04 | Hierarchy that breathes | **5 / 10** |
| 05 | Imagery with intent | **5 / 10** |
| 06 | Motion that whispers | 7 / 10 |
| 07 | ~~Mobile that's designed, not shrunk~~ | *n/a — Windows desktop app* |
| 08 | The invisible expensive stuff | 7 / 10 |

---

## 01 · Point of view — 6/10

**What's there.** The Workbench direction is a real position: dense, opaque, tool-first,
no glassmorphism, depth from stepped surfaces and hairlines rather than blur. It's executed
consistently across nine pages. It is not generic.

**Why it isn't higher.** Two problems.

First, the palette was inherited, not chosen — near-black + amber was a given. That's fine,
but it means the most visible expression of taste was decided before the design started.

Second, and more seriously: **the one element that made this direction a thesis rather than
a layout was never built.** The filmstrip with shared cross-tool page selection was the
argument for why twelve tools are one application. Without it, what shipped is the standard
professional-app arrangement — left rail, center stage, right inspector. Figma, Affinity,
Ableton, and a thousand others use it. It is the *correct* choice for this product and the
*default* choice simultaneously, which is exactly what the checklist warns about.

Right now the app has taste but not a thesis. Batch 3 below proposes a signature that is
achievable without touching PDF code.

## 02 · Typography — 6/10

**What's there.** Public Sans + Spline Sans Mono, self-hosted, both variable, ~100 KB
total. Explicitly not Inter or Roboto — which the checklist names directly. The rule that
**every quantity sets in mono with tabular figures** is the strongest typographic idea in
the build: it is systematic, it does real work (values stop jittering as they update), and
it is what makes the app read as an instrument.

**Why it isn't higher.** The checklist asks for "a paired display + body face." There
isn't one. Public Sans does everything from 11px labels to the 20px page title. Body + mono
is a different axis than display + body, and it leaves the app with no typographic moment
anywhere — nothing that was *chosen* rather than *sized*.

The scale is the concrete symptom: **10, 11, 12, 13, 14, 15, 20px**. The largest type in
the entire application is 20px, and the title-to-body ratio is 1.54:1. Hierarchy is being
asked to travel through weight alone, and weight alone cannot carry it.

**A debt of my own making:** the page-number badge on the Rotate tiles is 10px, which
violates the "no text below 11px anywhere" rule written into MASTER.md §5.

## 03 · Restrained color — 8/10

The strongest area. Amber plus a neutral ramp plus three muted semantics, applied through
tokens with no raw hex in components. The eleven per-tool accent colors on the old dashboard
were deliberately removed — eleven unrelated hues is a rainbow, not a system, and it left
amber meaningless as a signal.

Contrast was measured, not eyeballed. `.btn-primary` was **2.3:1** (white on `#D0A700`) on
the most-clicked control in the app; it's now **8.2:1**. Light-mode amber text was
**3.17:1**; it's now **4.82:1** via a separate `--amber-text` token that darkens on paper
while amber *fills* keep the brand hue.

**Held back by:** `--info` is defined in both themes and in `.status-info`, and used by
nothing. Dead tokens are how restrained systems stop being restrained. And light mode has
never actually been looked at — the ratios are arithmetic, not observation.

## 04 · Hierarchy that breathes — 5/10

The weakest structural score, and it's a direct consequence of a choice I made: density.
A 13px base, a 4–48px spacing scale, and a 48px header bar were right for a tool someone
keeps open all day. But "breathes" is the opposite of what I optimized for, and I overshot.

Concretely, the inspector is a flat vertical stack: every group is introduced by the same
11px uppercase eyebrow, separated by the same 24px gap, at the same visual weight. There is
no primary, secondary, tertiary — there's a list. On most pages nothing dominates, because
the one element large enough to dominate (the stage) is usually empty or showing a preview.

Whitespace and scale are the two instruments the checklist names, and I'm using neither.

## 05 · Imagery with intent — 5/10

Reading this as *"every non-text visual element, and what the product looks like at rest."*

**What's there.** Icon discipline is genuinely good: lucide throughout, consistent 14–18px
sizing, no emoji, decorative-vs-labelled handled.

**Why it's low.** Eleven of twelve pages open with no document, and the at-rest state is
a 32px gray icon at 0.35 opacity above one line of text. That is the default empty state
from every admin template ever shipped. **The app spends most of its life in this state and
it is the least designed thing in the build.**

Worse, the composition is wrong: on an empty page the dropzone sits in the 300px inspector
while the entire stage — the largest area on screen — displays a gray icon. The drop target
should be the big thing.

## 06 · Motion that whispers — 7/10

Restraint is genuine and deliberate: 120ms color, 180ms panel, a 140ms opacity-only route
crossfade. The old `x: 10 → 0` slide was removed because it fought the fixed rail and made
the window twitch on every navigation. `prefers-reduced-motion` and the Minimal tier are
honored independently. Nothing here would make a designer wince.

But the bar is "a designer would nod," and nodding requires something to nod *at*. There
are no crafted micro-interactions — no considered transition when a document loads, no
feedback moment when an operation completes. The score is for successfully avoiding slop,
not for craft. The performance tiers make this partly a deliberate constraint, which is why
it isn't lower.

## 07 · Mobile — not scored

Excluded by decision: this is a Windows desktop application, so phone and tablet layouts
are not a use case and the criterion does not transfer.

Recorded once for the file, not as a scored finding: the stylesheet contains exactly one
responsive breakpoint (`@media (max-width: 1180px)` on the dashboard grid; the only other
media query is `prefers-reduced-motion`). At the enforced minimum window of 1000×700
(`electron/main.ts:49`) the rail takes 220px and the inspector 300px, leaving 480px of
stage. This only matters if half-screen window snapping is a use case — it has been
descoped, and the corresponding fix batch was dropped.

## 08 · The invisible expensive stuff — 7/10

**Done well:** measured WCAG fixes (above); one global `:focus-visible` rule that is never
removed anywhere; semantic markup in the new pages (`<dl>` for readouts, `<ol>` for the
merge queue, `<figure>` for image results, `<aside>` for inspectors); 16 `aria-label`s,
6 `aria-pressed`, proper `role="radiogroup"`/`radio`, and a real focus trap with focus
restoration in the modal. Fonts are self-hosted so a packaged app makes **no network request
on launch** — previously it silently fell back to Segoe UI offline. Theme is applied before
first paint, so there's no flash.

**Not done:** the bundle is **2.39 MB / 752 KB gzipped** and trips Vite's size warning;
`mammoth`, `xlsx` and `html2canvas` parse at startup in every session even if you only open
PDFs. `ProgressBar` has no `role="progressbar"`, status messages have no `aria-live` (a
screen reader never hears "Compressed"), there are no keyboard shortcuts anywhere in a tool
that wants to be a pro app, and light mode remains visually unverified.

---

# Fixes, in batches

Ordered by how much each moves the score. **Batches 1 and 2 are where the real gain is** —
together they address the two weakest criteria and cost the least risk, since neither goes
anywhere near PDF code.

Five batches, not six: the small-window batch was dropped along with criterion 07.

Every batch below is deliverable **without modifying any function that loads, parses,
converts or writes PDFs**, unless explicitly marked otherwise.

---

## Batch 1 — Give the type somewhere to go
*Fixes 02 and 04. Highest impact, lowest risk. No PDF code.*

The single change that most improves this build: **stop asking weight to do hierarchy's job.**

1. **Add a display face, used no more than twice per screen.** Dashboard title, empty-state
   headline, and nothing else. It should never appear at 13px.

   Recommendation: **Fraunces** (variable, with `SOFT` and `WONK` axes) — high-contrast,
   genuinely uncommon, and reads as *document* rather than *dashboard*, which suits a PDF
   tool. It avoids Instrument Serif, which has become the default AI-generated display face.

   **One real constraint to decide first:** Fraunces covers latin and latin-ext only. The
   app ships `el`, `ja` and `zh`, so a Greek or Japanese user would see the fallback for
   every display string. Two ways out — accept it (display strings are few, and the fallback
   is a clean system serif), or choose **Literata**, which is variable and covers Greek,
   trading some personality for coverage. This is a real decision, not a detail.

2. **Extend the scale to give it range.** Current: 10/11/12/13/14/15/20. Proposed:
   11/12/13/15/20/28/40, with 40px used exactly once per screen and 28px reserved for
   empty-state headlines. Delete 10px and 14px.

3. **Kill the 10px badge** on Rotate's page tiles — it violates MASTER.md §5. Move to 11px.

4. **Break the inspector's flat stack.** The first group on each page (Document) becomes
   visually primary: larger filename, more space beneath it, a hairline separating it from
   the controls below. Everything after it steps down. Right now all groups are peers.

5. **Let the header bar breathe on the dashboard only.** The 48px bar is right for tool
   pages and wrong for the one screen that is not a tool. Give Home a real masthead.

---

## Batch 2 — Design the at-rest state
*Fixes 05, and part of 01. No PDF code.*

The app is empty most of the time. Treat that as the primary screen, not the fallback.

1. **Move the dropzone into the stage.** When no document is loaded, the entire stage
   becomes the drop target — the largest element on screen doing the most important job. The
   inspector shows the tool's options in a disabled/preview state so you can see what the
   tool does before committing a file. Today it's inverted: dropzone in a 300px column,
   gray icon filling the stage.

2. **Design one real empty state and reuse it.** A large, precise outline of a page at true
   A4 proportion, drawn in hairlines on the stage ground, with the tool's action expressed
   inside it — split shows a dashed division, rotate shows a corner arc, merge shows two
   offset outlines. Same component, one prop. This is the cheapest way to get "imagery with
   intent" in an app that has no photography and shouldn't have any.

3. **Give the dashboard a first-run state.** Right now it's eleven identical cards. It is
   the app's only chance to say what it is.

4. **Empty states get a headline, not a caption.** 28px display face, one sentence, and the
   action. Currently 13px gray text.

---

## Batch 3 — A signature that doesn't need PDF code
*Fixes 01. This is the one that raises the headline score. No PDF code.*

The filmstrip is blocked. But there is a second true fact about this app that nothing in the
UI currently surfaces, and it's arguably more interesting:

**Tools already chain.** `useToolStore` passes the working document from tool to tool — you
can compress, then rotate, then protect, and each step carries the previous result forward
without re-uploading. The store's own comments document this deliberately. **The interface
never mentions it.** Users almost certainly re-upload between tools because nothing tells
them not to.

Proposal: **the document ledger.** A persistent strip in the rail, below the nav, showing
the working document and the chain of operations applied to it this session —

```
WORKING DOCUMENT
report-q3.pdf              2.4 MB
────────────────────────────────
  ✓ Merged        4 files
  ✓ Compressed    −76%
  ✓ Rotated       all pages
  → Protect
```

It needs only `file.name`, `file.size`, and a list of operations appended by each page after
its existing work completes — all of it available outside the PDF functions. It makes the
app's actual behaviour visible, it is specific to this product in a way no template has, and
it gives the design the thesis it's currently missing.

If the no-PDF-code constraint is ever lifted, the filmstrip and this are complementary: the
ledger is *what happened to the document*, the filmstrip is *which pages*.

---

## Batch 4 — Finish the invisible work
*Fixes 08. Items marked ⛔ require PDF code and are blocked.*

1. `role="progressbar"` with `aria-valuenow/min/max` on `ProgressBar`.
2. `aria-live="polite"` on the status region so completions are announced. Right now a
   screen-reader user gets no confirmation that anything happened.
3. **Keyboard shortcuts** — `Ctrl+O` open, `Ctrl+S` save result, `Ctrl+,` settings,
   `Ctrl+1…9` jump to tool. A tool that wants to feel professional and has zero shortcuts
   is not finished.
4. **Verify light mode visually.** It has never been looked at; the contrast figures are
   arithmetic. Also confirm Greek and Japanese render without tofu through the fallback stack.
   Worth doing at a couple of window widths while you're there, since nothing has ever been
   checked below full screen.
5. **Delete `--info`** and `.status-info`, or use them. Dead tokens rot systems.
6. ⛔ Lazy-load `mammoth` / `xlsx` / `html2canvas` — the cheapest large win available
   (~2.39 MB bundle, all three parsing at startup), blocked because it means editing
   `fileConverter.ts` imports.

---

## Batch 5 — Earn the nod on motion
*Fixes 06. Gate everything here to the Full tier. No PDF code.*

Deliberately last, and deliberately small. Two moments, not a system:

1. **Document arrival.** When a file loads, the inspector's controls stagger in over ~180ms
   while the stage settles. One orchestrated moment, on the event that matters most.
2. **Operation completion.** The primary button transitions to its completed state in place
   rather than a banner appearing elsewhere — the verb stays where the click was.

Everything else stays at 120ms and silent.

---

## What I would not do

- **Don't add illustration or photography.** Empty-state geometry (Batch 2) is the right
  answer for a document tool; stock art would make it look cheaper, not more expensive.
- **Don't loosen the density globally.** The fix for criterion 04 is *scale contrast and
  selective space*, not padding everywhere. This is still a tool.
- **Don't add a second accent color.** Criterion 03 is the strongest score precisely
  because there's only amber.
- **Don't build responsive/mobile layouts.** Out of scope — Windows desktop only.

---

# After the batches

All five batches implemented. Rescored on the same basis, still self-assessed.

| # | Criterion | Before | After |
|---|---|---|---|
| 01 | Point of view, not a template | 6 | **8** |
| 02 | Typography that does work | 6 | **8** |
| 03 | A restrained color system | 8 | 8 |
| 04 | Hierarchy that breathes | 5 | **7** |
| 05 | Imagery with intent | 5 | **8** |
| 06 | Motion that whispers | 7 | **8** |
| 08 | The invisible expensive stuff | 7 | **8** |
| | **Total** | **44 / 70** | **55 / 70** |

## What changed, by criterion

**01 (6 → 8).** The app now has a thesis it didn't have: the **document ledger**. It
surfaces the fact that tools already chain — the working document carries from compress to
rotate to protect without re-opening — which the interface had never once mentioned. It is
derived purely by observing `useToolStore` from `DocumentLedger.tsx`, so no PDF function
knows it exists. Not a 9 or 10: the underlying layout is still the standard pro-app
arrangement, and the filmstrip remains blocked.

**02 (6 → 8).** Literata added as a display face, used only at 28px and 40px and never for
UI. Chosen over more characterful Latin-only candidates because it covers **Greek**, which
the app ships — a Latin-only display face would have left Greek headlines in a fallback while
English got the real thing. Scale is now **11/12/13/15/20/28/40**; the off-scale 10px and
14px are gone, and the title-to-body ratio went from 1.54:1 to 3.1:1.

**03 (8 → 8).** Only the dead `--info` token and `.status-info` rule were removed. The other
holdback stands: **light mode has still never been looked at.** The contrast figures remain
arithmetic.

**04 (5 → 7).** The dashboard gets a masthead with the app's single 40px moment, and copy
that says what the product does instead of "Welcome to". The inspector's first group is now
visually primary rather than one peer in a flat stack. Not higher because the tool pages
below their header bars are still fairly even in weight.

**05 (5 → 8).** `EmptyStage.tsx` replaces the grey-icon empty state on all nine pages. The
whole stage is the drop target now — previously the dropzone sat in a 300px inspector while
the largest area on screen showed an icon. The artwork is a page at true A4 proportion in
hairlines with a per-tool motif inside it: a dashed cut for split, a corner arc for rotate,
two converging sheets for merge, a raster grid for convert. Geometry, not illustration.

**06 (7 → 8).** Two crafted moments, both `[data-perf='full']`-scoped so Light and Minimal
never run them and `prefers-reduced-motion` still overrides at any tier: the inspector
resolves in sequence when a document arrives, and results confirm in place next to the
button that was clicked rather than announcing themselves elsewhere.

**08 (7 → 8).** `role="progressbar"` with full value semantics; `role="alert"` +
`aria-live="assertive"` on errors and `status`/`polite` on successes, so a screen-reader user
finally learns that an operation finished; keyboard shortcuts (`Ctrl+1–9`, `Ctrl+0`,
`Ctrl+,`, `Ctrl+Shift+L`) keyed off `e.code` so they survive a Greek or Japanese layout, and
listed in Settings so they are discoverable rather than secret.

## Still outstanding

- **Light mode has not been visually verified.** Highest-value remaining check.
- **Bundle is still ~2.4 MB**; `mammoth`/`xlsx`/`html2canvas` parse at startup. Blocked by
  the no-PDF-code constraint.
- **Fonts now total ~284 KB** on disk with Literata added, though `unicode-range` means a
  session only reads the subsets its language needs (~84 KB English, ~115 KB Greek).
- **The filmstrip**, and the render-loop performance work, both still blocked.
- `Edit`, `Sign` and `PdfPreviewer` remain unmigrated, so the legacy token alias block and
  the two `backdrop-filter` uses are still in the tree.
