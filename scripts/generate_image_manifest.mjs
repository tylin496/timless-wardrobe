/**
 * Lists every raster image under ./images and writes ./images/_manifest.json
 * so the app can match covers to files that no wardrobe row references yet.
 */
import fs from "fs";
import path from "path";

const root = process.cwd();
const dir = path.join(root, "images");
const outFile = path.join(dir, "_manifest.json");
const exts = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const names = fs.readdirSync(dir);
const paths = [];
for (const name of names) {
  if (name === "_manifest.json") continue;
  const ext = path.extname(name).toLowerCase();
  if (!exts.has(ext)) continue;
  paths.push("images/" + name.split(path.sep).join("/"));
}
paths.sort();

fs.writeFileSync(outFile, JSON.stringify(paths, null, 2) + "\n", "utf8");
console.log(`Wrote ${paths.length} paths to ${path.relative(root, outFile)}`);
