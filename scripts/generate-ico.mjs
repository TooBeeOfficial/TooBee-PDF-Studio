/**
 * generate-ico.mjs
 * Converts public/bee-logo.svg → build/icon.ico (multi-size: 16,32,48,256)
 * Uses only Jimp (pure JS, no native bindings) — installed on first run.
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
const svgPath = path.join(root, 'public', 'bee-logo.svg');
const sizes = [256, 48, 32, 16];
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

const pngBuffers = [];
for (let i = 0; i < sizes.length; i++) {
  const sz = sizes[i];
  const resvg = new Resvg(svgContent, {
    fitTo: { mode: 'width', value: sz },
  });
  const data = resvg.render();
  const png = data.asPng();
  writeFileSync(pngPaths[i], png);
  pngBuffers.push(png);
  console.log(`✓ ${sz}×${sz} PNG`);
}

// ─── 3. Pack PNGs into ICO ────────────────────────────────────────────────────
const { default: pngToIco } = await import('png-to-ico');
const ico = await pngToIco(pngPaths);

const icoPath = path.join(outDir, 'icon.ico');
writeFileSync(icoPath, ico);

console.log(`\n✅ ICO written → ${icoPath}`);

// Cleanup temp PNGs
for (const p of pngPaths) {
  try { (await import('fs')).unlinkSync(p); } catch { }
}
