// scripts/copy-static.mjs
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");

const copyDirs = [
  "templates",
  "lang",
  "styles",
  // add more if you have them, e.g. "assets"
];

const copyFiles = [
  "module.json",
  // add "README.md" if you want it in dist
];

fs.mkdirSync(dist, { recursive: true });

for (const d of copyDirs) {
  const src = path.join(root, d);
  const dst = path.join(dist, d);
  if (!fs.existsSync(src)) continue;

  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
  console.log(`[copy] ${d} -> dist/${d}`);
}

for (const f of copyFiles) {
  const src = path.join(root, f);
  const dst = path.join(dist, f);
  if (!fs.existsSync(src)) continue;

  fs.copyFileSync(src, dst);
  console.log(`[copy] ${f} -> dist/${f}`);
}