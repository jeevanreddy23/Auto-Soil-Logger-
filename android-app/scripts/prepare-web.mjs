import { access, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const sourceRoot = resolve(repoRoot, "geologger");
const outputRoot = resolve(appRoot, "www");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(resolve(outputRoot, "vendor"), { recursive: true });

const fieldHtml = await readFile(resolve(sourceRoot, "field.html"), "utf8");
await writeFile(resolve(outputRoot, "index.html"), fieldHtml, "utf8");

const manifest = JSON.parse(await readFile(resolve(sourceRoot, "manifest.webmanifest"), "utf8"));
manifest.start_url = "./index.html";
manifest.orientation = "any";
await writeFile(resolve(outputRoot, "manifest.webmanifest"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
await copyFile(resolve(sourceRoot, "sw.js"), resolve(outputRoot, "sw.js"));
await copyFile(resolve(sourceRoot, "favicon.svg"), resolve(outputRoot, "favicon.svg"));

const lucideCandidates = [
  resolve(sourceRoot, "vendor", "lucide.min.js"),
  resolve(appRoot, "node_modules", "lucide", "dist", "umd", "lucide.min.js"),
  resolve(appRoot, "node_modules", "lucide", "dist", "umd", "lucide.js")
];
let lucideSource;
for (const candidate of lucideCandidates) {
  try {
    await access(candidate);
    lucideSource = candidate;
    break;
  } catch {}
}
if (!lucideSource) throw new Error("Lucide UMD bundle was not found. Run npm install first.");
await copyFile(lucideSource, resolve(outputRoot, "vendor", "lucide.min.js"));

console.log("Prepared STS GeoFlow Android web bundle in android-app/www");
