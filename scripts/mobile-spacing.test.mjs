#!/usr/bin/env node
/**
 * Mobile gutter convention.
 *
 * `.wrap` owns the page's horizontal inset. A second class on the same
 * element must not use the `padding` shorthand — `padding: 2rem 0` sets
 * left/right to 0 and wipes the gutter. Use padding-block instead.
 *
 *   node scripts/mobile-spacing.test.mjs
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

const C = process.stdout.isTTY
  ? { red: '\x1b[31m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' }
  : { red: '', green: '', dim: '', off: '' };

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (/\.(astro|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function isZero(value) {
  return /^(0|0px|0rem|0em)$/.test(value);
}

function horizontalPaddingHits(block) {
  const hits = [];
  for (const match of block.matchAll(/(?<!-)padding\s*:\s*([^;]+)/g)) {
    hits.push(match[0].trim());
  }
  for (const match of block.matchAll(/padding-(?:left|right|inline)\s*:\s*([^;]+)/g)) {
    const value = match[1].trim().split(/\s+/)[0];
    if (!isZero(value) && value !== 'var(--page-gutter)') hits.push(match[0].trim());
  }
  return hits;
}

function wrapCompanions(source) {
  const names = new Set();
  for (const match of source.matchAll(/class="([^"]+)"/g)) {
    const classes = match[1].split(/\s+/).filter(Boolean);
    if (!classes.includes('wrap')) continue;
    for (const name of classes) {
      if (name !== 'wrap') names.add(name);
    }
  }
  return names;
}

function ruleBodies(css, className) {
  const bodies = [];
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\.${escaped}(?![\\w-])\\s*\\{([^}]*)\\}`, 'g');
  for (const match of css.matchAll(re)) bodies.push(match[1]);
  return bodies;
}

const failures = [];

const theme = await readFile(join(SRC, 'styles', 'theme.css'), 'utf8');
if (!/--page-gutter:\s*24px/.test(theme)) {
  failures.push('mobile --page-gutter must be 24px so content is not flush to the screen');
}
if (!/\.wrap\s*\{[^}]*padding-inline:\s*var\(--page-gutter\)/.test(theme.replace(/\s+/g, ' '))) {
  failures.push('.wrap must read padding-inline from --page-gutter');
}
if (!/@media\s*\(max-width:\s*699px\)/.test(theme)) {
  failures.push('theme.css must tighten buttons and type on viewports under 700px');
}

const render = await readFile(join(SRC, 'components', 'sections', 'Render.astro'), 'utf8');
if (!/@media\s*\(max-width:\s*699px\)[\s\S]*\.sx-section/.test(render)) {
  failures.push('Render.astro must reduce .sx-section padding on small screens');
}

const quiz = await readFile(join(SRC, 'components', 'LeadQuiz.astro'), 'utf8');
if (!/@media\s*\(max-width:\s*479px\)[\s\S]*\.quiz-options[\s\S]*1fr/.test(quiz)) {
  failures.push('quiz options must collapse to one column on narrow phones');
}

const pdp = await readFile(join(SRC, 'pages', '[category]', '[slug].astro'), 'utf8');
const galleryBlock = pdp.match(/\.pdp-gallery\s*\{[^}]+\}/);
if (!galleryBlock || !/repeat\(\s*2/.test(galleryBlock[0])) {
  failures.push('product gallery must be 2 columns on mobile, not 4');
}

for (const file of await walk(SRC)) {
  const source = await readFile(file, 'utf8');
  const companions = wrapCompanions(source);
  if (companions.size === 0) continue;
  const rel = relative(ROOT, file).replaceAll('\\', '/');
  for (const name of companions) {
    for (const body of ruleBodies(source, name)) {
      for (const hit of horizontalPaddingHits(body)) {
        failures.push(`${rel} .${name} adds horizontal padding on top of .wrap (${hit})`);
      }
    }
  }
}

if (failures.length) {
  console.log(`${C.red}FAIL${C.off}  mobile spacing\n`);
  for (const item of failures) console.log(`  ${C.dim}•${C.off} ${item}`);
  console.log(`\n  ${failures.length} failure${failures.length === 1 ? '' : 's'}\n`);
  process.exit(1);
}

console.log(`${C.green}PASS${C.off}  mobile spacing  ${C.dim}wrap owns the gutter; sections pad vertically only${C.off}`);
