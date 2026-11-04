// Copies public/ and every pieces/NNN-slug/ folder into dist/, and writes dist/pieces.json for the gallery.
import { readdirSync, readFileSync, existsSync, rmSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
const out = 'dist';
rmSync(out, { recursive: true, force: true }); mkdirSync(out);
cpSync('public', out, { recursive: true });
const list = [];
for (const d of readdirSync('pieces', { withFileTypes: true })) {
  if (!d.isDirectory() || !/^\d{3}-/.test(d.name)) continue;
  if (!existsSync(`pieces/${d.name}/index.html`)) continue;
  let meta = {};
  try { meta = JSON.parse(readFileSync(`pieces/${d.name}/meta.json`, 'utf8')); } catch {}
  cpSync(`pieces/${d.name}`, `${out}/${d.name}`, { recursive: true });
  const code = {};
  const pick = (k, dir, re) => { const dd = `pieces/${d.name}${dir}`; if (!existsSync(dd)) return; const f = readdirSync(dd).find(n => re.test(n)); if (f) code[k] = `/${d.name}${dir}/${f}`; };
  pick('web', '', /^index\.html$/); pick('swiftui', '/swiftui', /\.swift$/); pick('compose', '/android', /\.kt$/);
  list.push({ code, slug: d.name, no: d.name.slice(0, 3), title: meta.title || d.name.slice(4).replace(/-/g, ' '), date: meta.date || '', tags: meta.tags || [] });
}
list.sort((a, b) => b.slug.localeCompare(a.slug));
writeFileSync(`${out}/pieces.json`, JSON.stringify(list, null, 2));
console.log(`Built ${list.length} piece(s).`);
