import { execFileSync } from "node:child_process"
import { existsSync, statSync } from "node:fs"
import { join } from "node:path"

const appDir = process.argv[2] ?? process.cwd()
const out = join(appDir, "out", "main", "index.js")
const renderer = join(appDir, "out", "renderer", "index.html")
const watch = ["src", "native", "electron-builder.yml", "package.json"]

if (!existsSync(out) || !existsSync(renderer)) {
  process.stderr.write("missing build output; run npm run build\n")
  process.exit(2)
}

const built = Math.min(statSync(out).mtimeMs, statSync(renderer).mtimeMs)
const newest = execFileSync(
  "find",
  [join(appDir, "src"), ...watch.filter((p) => p !== "src").map((p) => join(appDir, p))],
  { encoding: "utf8" }
)
  .split("\n")
  .filter((line) => line.length > 0 && existsSync(line) && statSync(line).isFile())
  .reduce((acc, file) => Math.max(acc, statSync(file).mtimeMs), 0)

if (newest > built) {
  process.stderr.write("stale build: sources are newer than out/; run npm run build before packaging\n")
  process.exit(1)
}

process.stdout.write("build is fresh\n")
