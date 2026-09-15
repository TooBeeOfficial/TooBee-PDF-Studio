/**
 * generate-ico.mjs
 * Converts public/app-icon.svg → build/icon.ico and build/icon.png.
 *
 * The source is app-icon.svg, not bee-logo.svg: the bee alone is the app's
 * sidebar mark and the sites' favicon, while the icon Windows shows in the
 * taskbar, the Start menu and on the .exe is a page with the bee on it, so
 * that it reads as a PDF tool at a glance.
 *
 * Two pieces of artwork go in: app-icon.svg, and app-icon-small.svg for the
 * 16-32px entries. Below 32px the rules, the thin page edge and the outlined
 * wings all antialias to grey mush, so the small cut drops them and thickens
 * what is left. Same trick the Calender Maker's icon uses.
 *
 * ICO sizes are 16, 24, 32, 48, 64, 128 and 256 — Windows picks from these by
 * context (16 in the title bar and small Explorer views, 32 in the taskbar,
 * 48 in medium Explorer views, 256 for large icons), and a size missing from
 * the file gets resampled from a neighbour, usually badly. icon.png is the
 * 512px square electron-builder wants for the macOS and Linux targets.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

// ─── 1. Make sure we have png-to-ico (already installed) ─────────────────────
const outDir = path.join(root, 'build');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

// ─── 2. Use PowerShell + System.Drawing to rasterize the SVG to PNGs ─────────
const svgPath = path.join(root, 'public', 'app-icon.svg');
const svgSmallPath = path.join(root, 'public', 'app-icon-small.svg');
const SMALL_CUT = 32; // at or below this size, use the simplified artwork
const sizes = [256, 128, 64, 48, 32, 24, 16];
const pngPaths = sizes.map(s => path.join(outDir, `icon_${s}.png`));

// PowerShell one-liner: use WPF to render SVG at each size
const psScript = `
Add-Type -AssemblyName PresentationCore, PresentationFramework, WindowsBase, System.Xml
$svgPath = '${svgPath.replace(/\\/g, '\\\\')}'
$svgText = [System.IO.File]::ReadAllText($svgPath)
$sizes   = @(${sizes.join(',')})
$outs    = @('${pngPaths.map(p => p.replace(/\\/g, '\\\\')).join("','")}')

for ($i = 0; $i -lt $sizes.Count; $i++) {
  $sz  = $sizes[$i]
  $out = $outs[$i]

  $stream = [System.IO.MemoryStream]::new([System.Text.Encoding]::UTF8.GetBytes($svgText))
  $svg    = [System.Windows.Media.Imaging.SvgBitmapDecoder]::new($stream,
    [System.Windows.Media.Imaging.BitmapCreateOptions]::None,
    [System.Windows.Media.Imaging.BitmapCacheOption]::Default)

  $scale  = $sz / $svg.Frames[0].PixelWidth
  $scaled = [System.Windows.Media.Imaging.TransformedBitmap]::new(
    $svg.Frames[0],
    [System.Windows.Media.ScaleTransform]::new($scale, $scale)
  )
  $enc = [System.Windows.Media.Imaging.PngBitmapEncoder]::new()
  $enc.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($scaled))
  $fs = [System.IO.FileStream]::new($out, [System.IO.FileMode]::Create)
  $enc.Save($fs)
  $fs.Close()
  Write-Host "PNG $sz done"
}
`;

// WPF SvgBitmapDecoder is only in .NET framework — fall back to a pure Canvas approach via canvas npm
// Let's try a different, more reliable approach: use the inline SVG data to create PNGs via Jimp (pure JS)
// Actually the most reliable zero-native approach is to use the svg-to-png npm or just draw manually.

// ─── SIMPLEST RELIABLE APPROACH: Draw bee directly as PNG using pure Buffer ───
// We'll write a minimal SVG-to-raster using the `@resvg/resvg-js` WASM build
// which has zero native dependency issues.

async function ensurePkg(pkg) {
  try { return await import(pkg); } catch {
    console.log(`Installing ${pkg}...`);
    execSync(`npm install --save-dev ${pkg}`, { cwd: root, stdio: 'inherit' });
    return await import(pkg);
  }
}

const resvgMod = await ensurePkg('@resvg/resvg-js');
const { Resvg } = resvgMod;

const svgContent = readFileSync(svgPath);
const svgSmallContent = existsSync(svgSmallPath)
  ? readFileSync(svgSmallPath)
  : svgContent;

const pngBuffers = [];
for (let i = 0; i < sizes.length; i++) {
  const sz = sizes[i];
  const art = sz <= SMALL_CUT ? svgSmallContent : svgContent;
  const resvg = new Resvg(art, {
    fitTo: { mode: 'width', value: sz },
  });
  const data = resvg.render();
  const png = data.asPng();
  writeFileSync(pngPaths[i], png);
  pngBuffers.push(png);
  console.log(`✓ ${sz}×${sz} PNG${sz <= SMALL_CUT ? ' (small cut)' : ''}`);
}

// ─── 3. Pack PNGs into ICO ────────────────────────────────────────────────────
const { default: pngToIco } = await import('png-to-ico');
const ico = await pngToIco(pngPaths);

const icoPath = path.join(outDir, 'icon.ico');
writeFileSync(icoPath, ico);

// ─── 4. The PNG the macOS and Linux targets use ──────────────────────────────
writeFileSync(
  path.join(outDir, 'icon.png'),
  new Resvg(svgContent, { fitTo: { mode: 'width', value: 512 } }).render().asPng()
);

console.log(`\n✅ ICO written → ${icoPath}`);

// Cleanup temp PNGs
for (const p of pngPaths) {
  try { (await import('fs')).unlinkSync(p); } catch { }
}
