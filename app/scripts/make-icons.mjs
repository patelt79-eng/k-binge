// Renders the app icon (design 2f, Lavender): "K" in Bricolage Grotesque 800, #1B1530 on #C9B8FF.
// Run: npm run icons → public/icons/{180,192,512,512-maskable}.png and public/favicon.svg
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import { Resvg } from '@resvg/resvg-js';

const root = fileURLToPath(new URL('..', import.meta.url));
const fontFile = `${root}node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff`;
const buf = readFileSync(fontFile);
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

const BG = '#C9B8FF';
const FG = '#1B1530';

/** K glyph sized to `scale` of the tile height, optically centred. */
function svg(size, scale, radius) {
  const fontSize = size * scale;
  const path = font.getPath('K', 0, 0, fontSize);
  const bb = path.getBoundingBox();
  const dx = (size - (bb.x2 - bb.x1)) / 2 - bb.x1;
  const dy = (size - (bb.y2 - bb.y1)) / 2 - bb.y1;
  const d = font.getPath('K', dx, dy, fontSize).toPathData(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${BG}"/><path d="${d}" fill="${FG}"/></svg>`;
}

const png = (s, size) => new Resvg(s, { fitTo: { mode: 'width', value: size } }).render().asPng();

mkdirSync(`${root}public/icons`, { recursive: true });
// iOS and Android mask the corners themselves, so full-bleed squares.
for (const size of [180, 192, 512]) writeFileSync(`${root}public/icons/${size}.png`, png(svg(size, 0.74, 0), size));
// Maskable: keep the glyph inside the 80% safe zone.
writeFileSync(`${root}public/icons/512-maskable.png`, png(svg(512, 0.74 * 0.8, 0), 512));
writeFileSync(`${root}public/favicon.svg`, svg(64, 0.74, 14));
console.log('icons written');
