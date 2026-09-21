<div align="center">
  <h1>TooBee PDF Studio</h1>
  <p><strong>A desktop PDF workbench for Windows. Eleven tools in one window, and nothing leaves your machine.</strong></p>
  <p>Version 1.0.0</p>
</div>

---

TooBee PDF Studio is a local-first PDF application built with **React**, **Vite** and
**Electron**. There is no account, no upload and no server involved at any point —
document rendering and manipulation both run inside the app, so you can unplug the
machine and everything still works.

## ✨ Features

### Document

- **Merge PDFs** — combine multiple files into one.
- **Advanced Split** — break a PDF into separate files.
- **Compress** — reduce file size by stripping metadata and optimising streams.
- **Rotate & Reorder** — manage and spin page layout.
- **Extract Pages** — pull out specific pages.
- **Extract to Folder** — split every page into its own PDF and save them as a ZIP.

### Studio

- **Studio Editor** — overlay text, shapes and colour on any page, with system font
  selection, alignment, opacity and corner radius.
- **Sign PDF** — sign three ways: **type** a name in any installed typeface, **draw**
  one with the mouse, pen or trackpad, or **import** a photo of a real signature.
  Anything placed can then be moved, resized, rotated, flipped and faded, and saved to
  a library for reuse.

Drawn signatures are stored as strokes rather than pixels, so the mark is re-rendered
at export resolution (roughly 288 DPI) instead of being resampled from whatever size
the pad happened to be — a signature drawn in a 260px box still prints cleanly. Stroke
width follows drawing speed, which reproduces the weight distribution of real
handwriting closely enough to read as ink.

Imported photos go through crop, then a background cutout that lifts the ink off the
paper. Three methods are offered because none of them is right for every source:

| Method | How it works | Best for |
| --- | --- | --- |
| **Brightness** | Clears every pixel lighter than a cutoff | Dark ink on white paper |
| **Edge colour** | Flood-fills inward from the four corners | Tinted or shadowed paper — it keeps dark areas *enclosed* by the ink, which a brightness cutoff cannot |
| **Automatic** | A segmentation model running on your machine | Any subject, at the cost of speed |

Saved signatures live as one JSON file each in the app's data folder, so they can be
backed up, copied to another machine, or deleted by hand — there is a button in the
panel that opens the folder.

### Security

- **Protect PDF** — encrypt a document with a password (AES-256).
- **Unlock PDF** — remove password protection and export freely.

Protect writes true AES-256 encryption — PDF 2.0's `/V 5 /R 6` security handler with
the `AESV3` crypt filter, not the dated RC4 the format shipped for years. Passwords go
through SASLprep (RFC 4013), so the full Unicode range works: accented, CJK and emoji
passwords all produce files any conforming reader will open.

One limit is inherited from the format: ISO 32000-2 caps AES-256 passwords at **127
bytes** and truncates anything longer *silently*, which would mean two passwords sharing
their first 127 bytes open the same file. Rather than let that happen, the Protect field
enforces the cap as you type and says so when it trims. The budget is bytes rather than
characters, counted after SASLprep normalisation: an ASCII character costs 1, a CJK
character 3, an emoji 4, and `㍿` expands to 12. Roughly 42 CJK characters or 127 ASCII
ones reach the limit.

### Conversion

- **PDF to Image** — convert PDFs to and from images.

## 🎛️ Beyond the tool list

- **Seven interface languages** — English, Ελληνικά, Español, Italiano, 日本語,
  Türkçe, 中文. The whole interface — labels, buttons, screen-reader text and error
  messages alike, not just the docs.
- **Three performance tiers** — Full, Light and Minimal. Minimal turns off animation
  entirely and renders fewer page thumbnails up front, for older or slower machines.
  A first-launch probe suggests a tier if the machine looks like it would benefit.
- **Light, dark, or follow the system.** The light theme is warm paper rather than an
  inverted dark theme, and contrast was checked separately in both.
- **Keyboard shortcuts throughout** — see the table below.
- **Drop a file anywhere.** Every tool page accepts a dropped document over its whole
  surface, not just onto a dropzone, and every sidebar carries the same uploader.
- **Continuous zoom.** The wheel, the buttons and `Ctrl` `+`/`-` all scale
  proportionally rather than stepping through fixed presets, so a notch changes the
  view by the same proportion at 30% as at 300%.
- **Opens more than PDFs** — Word, Excel, images, text, CSV, RTF, Markdown and HTML
  come in; PDF goes out.
- **Never touches the network.** Typefaces (Public Sans, Literata, Spline Sans Mono)
  and the PDF renderer ship inside the app.

## ⌨️ Keyboard shortcuts

**Global**

| Shortcut | Action |
| --- | --- |
| `Alt` + `1` … `9` | Jump to a tool |
| `Alt` + `0` | Dashboard |
| `Ctrl` + `,` | Settings |
| `Ctrl` + `Shift` + `L` | Toggle light / dark |

Navigation uses `Alt` rather than `Ctrl` so the `Ctrl` digits stay free for zoom.

**In a preview**

| Shortcut | Action |
| --- | --- |
| `Ctrl` + `=` / `Ctrl` + `-` | Zoom in / out |
| `Ctrl` + `0` | Reset zoom to 100% |
| `Shift` + wheel, `Ctrl` + wheel | Zoom |
| `PgUp` / `PgDn` | Previous / next page |
| `←` / `→` | Previous / next page, when nothing is selected |
| `Home` / `End` | First / last page |
| Arrow keys | Nudge the selection by 1pt — hold `Shift` for 10pt |
| `Delete` / `Backspace` | Delete the selection |
| `Escape` | Clear the selection, or cancel what is being drawn |

Zoom by key is deliberately gentler than by button: the shortcut auto-repeats when
held, so it moves 8% per press against the buttons' 25%.

## 📥 Install (end users)

Download `TooBee PDF Studio Setup 1.0.0.exe` from the
[Releases](https://github.com/TooBeeOfficial/TooBee-PDF-Studio/releases) page and run it.

The installer asks where to put the app, creates desktop and Start menu shortcuts, and
registers PDF, Word, Excel, image and text files so you can open one straight into a
tool. It installs for all users, so Windows will ask for elevation.

**Requirements:** Windows 10 or 11, 64-bit.

The installer is not code-signed yet, so Windows SmartScreen shows a blue "Windows
protected your PC" panel on first run. Choose **More info**, then **Run anyway**. That
panel is what an unsigned installer looks like, not a detection of anything in the file;
verify against the checksums on the release if you would rather not take it on trust.

## 🛠️ Prerequisites (development)

- [Node.js](https://nodejs.org/) v18 or higher
- npm (ships with Node.js)

## 📦 Setup

```bash
git clone https://github.com/TooBeeOfficial/TooBee-PDF-Studio.git
cd TooBee-PDF-Studio
npm install
```

### The background-removal model

`npm install` pulls `@imgly/background-removal-data`, a **221 MB** development
dependency holding the weights for the Sign page's *Automatic* cutout. Only a subset
ships: `npm run sync:models` copies the smaller 44 MB model plus the four ONNX runtimes
into `public/bg-removal/`, adding about **85 MB** to the packaged app. Every build
script runs it first, so there is nothing to remember.

The 44 MB model is chosen over the 88 MB one deliberately — on a high-contrast mark on
paper the larger one earns very little for twice the memory and inference cost. All
four runtimes ship because the library picks between them at runtime from the SIMD and
threading support it detects, and shipping only the likely one would strand whichever
machine detects differently.

To skip it entirely, drop the two `@imgly/*` entries from `devDependencies`. The sync
step then reports that it found nothing and exits cleanly, the build succeeds, and the
Automatic method reports itself unavailable in the import dialog while Brightness and
Edge colour carry on working. Nothing else changes.

Because the app must work with no network, the weights are served from disk rather than
the vendor's CDN. In development that is a plain path under `public/`; in the packaged
app the renderer runs on `file://`, where Chromium refuses `fetch()` outright, so the
main process exposes the same directory over a `bgmodel://` scheme.

## 💻 Development

Start the app with Hot-Module Replacement:

```bash
npm run dev
```

This spins up the Vite dev server and launches Electron against it.

For a fast unpacked production-mode build (no installer):

```bash
npm run build:dev
```

## 🏗️ Building for production

```bash
npm run build:win     # Windows NSIS installer
npm run build:mac     # macOS
npm run build:linux   # Linux
npm run build         # current platform
```

Output lands in `dist/` — for Windows, `TooBee PDF Studio Setup 1.0.0.exe`.

macOS and Linux targets are configured but are not published releases yet.

### Code signing

Signing is off by default. To sign a Windows build, set the certificate in the
environment before building — never commit it:

```powershell
$env:CSC_LINK = "C:\path\to\cert.pfx"
$env:CSC_KEY_PASSWORD = "..."
npm run build:win
```

## 🧪 Other commands

```bash
npm run gen:icon      # regenerate build/icon.ico from public/app-icon.svg
npm run sync:models   # refresh public/bg-removal/ from node_modules
```

`gen:icon` writes a multi-size ICO with **BMP** entries. That matters: a PNG-compressed
256×256 entry is a valid `.ico` but cannot be embedded as a Windows executable
resource, and `electron-builder` fails at the `rcedit` step with `Unable to commit
changes` if it encounters one.

DevTools no longer opens by itself on `npm run dev`. Set `DEVTOOLS=1` for a session, or
press `F12` / `Ctrl` + `Shift` + `I` at any time.

## 🗂️ Project structure

```
electron/          Electron main + preload
scripts/           Icon generation, model-pack sync
src/
  pages/           One file per tool, plus the dashboard
  components/      Previewer, uploader, ledger, settings, signature pad, shared inputs
  hooks/           Keyboard shortcuts, file drop, fit-on-load, font enumeration,
                   signature library
  store/           Zustand stores — tool state and preferences
  utils/           File conversion, PDF append and stamping, shapes, ink strokes,
                   image cutout
  styles/          All CSS, one file per page or element (see below)
  locales/         Seven translation bundles
  assets/fonts/    Self-hosted woff2 — no network font loading
public/
  bg-removal/      Generated by `npm run sync:models`; git-ignored
build/             Icons and the NSIS installer script
```

### Styles

`src/index.css` is only a manifest. Every rule lives in `src/styles/`, split across 43
files under `foundation/`, `layout/`, `components/` and `pages/`.

**The import order in the manifest is load-bearing.** CSS resolves ties between equally
specific rules by source order, so each file is a contiguous run of the original
stylesheet and the imports preserve that order. Adding a file alphabetically or at the
end can change which of two rules wins without either rule changing. Put new files
where their rules belong.

## 🌍 Localization

Every user-facing string lives in `src/locales/<lang>.json`, and all seven bundles share
an identical key shape. To add a language:

1. Copy `en.json` to `src/locales/<lang>.json` and translate the values, leaving every
   key exactly as it is.
2. Import and register the bundle in [`src/i18n.ts`](src/i18n.ts) alongside the others.
3. Add the language to the picker in [`src/components/SettingsModal.tsx`](src/components/SettingsModal.tsx).

Keys are namespaced per page (`protect.*`, `merge.*`, `sign.*`) with shared chrome under
`common.*`, `sidebar.*`, `fonts.*` and `shapes.*`. Anything used by more than one page —
Document, Add PDF, Zoom in, the font picker — belongs in a shared section rather than
being duplicated, or the copies drift.

Two traps worth knowing:

- Passing a variable named `count` to `t()` switches i18next into plural mode, and it
  will then look for `key_one` / `key_other` rather than the key itself. Name it
  something else unless you actually want pluralisation. Where plurals *are* wanted —
  page counts, for instance — supply `_one` and `_other` for languages that have both,
  and `_other` alone for Japanese and Chinese, whose plural rule has a single category.
- A `{{placeholder}}` dropped or renamed during translation fails silently: the value
  simply disappears from the rendered string. It is worth checking that placeholders
  match across every bundle, not just that the keys exist.

## 🧰 Built with

Electron, React and Vite, with [`pdf-lib`](https://pdf-lib.js.org/) and
[`pdf.js`](https://mozilla.github.io/pdf.js/) doing the document work and
[`@pdfsmaller/pdf-encrypt`](https://www.npmjs.com/package/@pdfsmaller/pdf-encrypt)
handling encryption, and [`@imgly/background-removal`](https://github.com/imgly/background-removal-js)
behind the optional signature cutout — all of which run locally, which is what makes the
offline guarantee real rather than a policy.

## ⚠️ Known limitations

- **The installer is unsigned.** Code signing is planned.
- **Windows only for now.** The macOS and Linux build targets exist but are unpublished.
- **No lint or typecheck config is committed.** There is no `eslint.config.*` (ESLint 9
  no longer reads `.eslintrc`) and no `tsconfig.json`, so `npm run lint` fails and
  `tsc --noEmit` has nothing to read. Types are stripped by esbuild at build time,
  never checked — which means a type error, an unused import or a variable used before
  its declaration all build perfectly happily and fail at runtime instead. Worth adding.
- **Typed signatures cannot be mirrored.** They stay real text in the exported PDF, so
  they rotate and resize but do not flip. Draw or import one to flip it.
- **`Annotate.tsx` and `ExtractText.tsx` are unreachable.** Neither is referenced by any
  route in `App.tsx`. They are also the only files still holding hardcoded English, and
  `ExtractText` uses an icon it never imports, so it would throw if it were ever wired
  up. Either route them or delete them.
- **`electron-builder` can fail at the `rcedit` step** with `Unable to commit changes`,
  immediately after it copies the ~180 MB Electron binary. It is a file-lock race —
  most often a virus scanner still reading the freshly written executable — rather than
  a configuration problem; the identical command succeeds moments later. Excluding
  `dist/` from real-time scanning avoids it.

---

<div align="center">
  <sub>Made by TooBee</sub>
</div>
