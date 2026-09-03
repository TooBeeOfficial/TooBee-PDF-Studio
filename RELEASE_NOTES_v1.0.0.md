TooBee PDF Studio is a desktop PDF workbench for Windows. Eleven tools in one
window, and none of your documents leave the machine — there is no account, no
upload, and no server involved at any point.

This is the first public release.

## Tools

**Document**

- **Merge PDFs** — combine multiple files into one.
- **Advanced Split** — break a PDF into separate files.
- **Compress** — reduce file size by stripping metadata and optimising streams.
- **Rotate & Reorder** — manage and spin page layout.
- **Extract Pages** — pull out specific pages.
- **Extract to Folder** — split every page into its own PDF and save them as a ZIP.

**Studio**

- **Studio Editor** — overlay text, shapes and colour on any page, with system
  font selection, alignment, opacity and corner radius.
- **Sign PDF** — add a signature to a document.

**Security**

- **Protect PDF** — encrypt a document with a password.
- **Unlock PDF** — remove password protection and export freely.

**Conversion**

- **PDF to Image** — convert PDFs to and from images.

## Beyond the tool list

- **Seven interface languages** — English, Ελληνικά, Español, Italiano, 日本語,
  Türkçe, 中文. The whole interface, not just the docs.
- **Three performance tiers** — Full, Light and Minimal. Minimal turns off
  animation entirely and renders fewer page thumbnails up front, for older or
  slower machines.
- **Light, dark, or follow the system.** The light theme is warm paper rather
  than an inverted dark theme, and contrast was checked separately in both.
- **Keyboard shortcuts throughout** — jump between tools, open the dashboard and
  settings, switch theme, and in a preview: zoom, change page, nudge a selection,
  delete it.
- **Opens more than PDFs** — Word, Excel, images, text, CSV, RTF, Markdown and
  HTML come in; PDF goes out.
- **Never touches the network.** Fonts and PDF rendering ship inside the app.
  Unplug the machine and everything still works.

## Install

Download `TooBee PDF Studio Setup 1.0.0.exe` below and run it.

The installer asks where to put the app, creates desktop and Start menu
shortcuts, and registers PDF, Word, Excel, image and text files so you can open
one straight into a tool. It installs for all users, so Windows will ask for
elevation.

**Requirements:** Windows 10 or 11, 64-bit.

### About the SmartScreen warning

The installer is not code-signed yet, so Windows SmartScreen will show a blue
"Windows protected your PC" panel the first time you run it. Choose
**More info**, then **Run anyway**.

This is what an unsigned installer looks like — not a detection of anything in
the file. Verify the download against the checksums below if you would rather
not take that on trust, and the full source is in this repository.

### Checksums

```
File     TooBee PDF Studio Setup 1.0.0.exe
Size     106,523,120 bytes (102 MB)
SHA-256  7f34651f0c1f85e9e678a0a47ea45774862d84299b8d06b4c6298f6937c71b2e
SHA-512  NbJEIiarkUOkNql4AF3REXTqUHdb33tcKESJ9A27oE0LSEAU0Mzd3UuVhYwk6uXKfQHWp5bn5NyujsjTA9eobg==
```

Verify in PowerShell:

```powershell
Get-FileHash "TooBee PDF Studio Setup 1.0.0.exe" -Algorithm SHA256
```

## Known limitations

- **The installer is unsigned.** Code signing is planned; until then, expect the
  SmartScreen prompt described above.
- **Protect PDF uses 128-bit RC4.** This is the encryption the PDF standard
  shipped for years and every reader still opens it, but it is dated — RC4 was
  dropped in PDF 2.0 in favour of AES-256. Treat it as a deterrent against
  casual access, not as protection for genuinely sensitive material. AES-256 is
  on the list.
- **Windows only for now.** The build targets macOS and Linux exist in the
  project but are not published yet.

## Built with

Electron, React and Vite, with `pdf-lib` and `pdf.js` doing the document work —
both of which run locally, which is what makes the offline guarantee real rather
than a policy.
