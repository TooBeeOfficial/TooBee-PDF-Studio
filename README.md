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
- **Sign PDF** — add a signature to a document.

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
| Arrow keys | Nudge the selection |
| `Delete` / `Backspace` | Delete the selection |
| `Escape` | Clear the selection, or cancel what is being drawn |

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
npm run gen:icon   # regenerate build/icon.ico from build/icon.png
```

## 🗂️ Project structure

```
electron/          Electron main + preload
src/
  pages/           One file per tool, plus the dashboard
  components/      Previewer, uploader, ledger, settings, shared inputs
  hooks/           Keyboard shortcuts, fit-on-load, system font enumeration
  store/           Zustand stores — tool state and preferences
  utils/           File conversion, PDF append, shape geometry
  locales/         Seven translation bundles
  assets/fonts/    Self-hosted woff2 — no network font loading
build/             Icons and the NSIS installer script
```

## 🌍 Localization

Every user-facing string lives in `src/locales/<lang>.json`, and all seven bundles share
an identical key shape. To add a language:

1. Copy `en.json` to `src/locales/<lang>.json` and translate the values, leaving every
   key exactly as it is.
2. Import and register the bundle in [`src/i18n.ts`](src/i18n.ts) alongside the others.
3. Add the language to the picker in [`src/components/SettingsModal.tsx`](src/components/SettingsModal.tsx).

Keys are namespaced per page (`protect.*`, `merge.*`) with shared chrome under
`common.*` and `sidebar.*`.

## 🧰 Built with

Electron, React and Vite, with [`pdf-lib`](https://pdf-lib.js.org/) and
[`pdf.js`](https://mozilla.github.io/pdf.js/) doing the document work and
[`@pdfsmaller/pdf-encrypt`](https://www.npmjs.com/package/@pdfsmaller/pdf-encrypt)
handling encryption — all of which run locally, which is what makes the offline
guarantee real rather than a policy.

## ⚠️ Known limitations

- **The installer is unsigned.** Code signing is planned.
- **Windows only for now.** The macOS and Linux build targets exist but are unpublished.
- **No lint or typecheck config is committed.** There is no `eslint.config.*` (ESLint 9
  no longer reads `.eslintrc`) and no `tsconfig.json`, so `npm run lint` fails and
  `tsc --noEmit` has nothing to read. Types are stripped by esbuild at build time,
  never checked.

---

<div align="center">
  <sub>Made by TooBee</sub>
</div>
