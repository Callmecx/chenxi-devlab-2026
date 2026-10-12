import { spawnSync, execFileSync } from "node:child_process";
import { mkdirSync, cpSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.BASE_PATH || "/";
const sourceRevision =
  process.env.GITHUB_SHA ||
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
if (!/^[a-f0-9]{40}$/.test(sourceRevision))
  throw Error("Invalid source revision");
if (!/^\/[a-zA-Z0-9/_-]*\/$/.test(base) && base !== "/")
  throw Error("BASE_PATH must be a simple absolute directory path ending in /");
function run(args, appBase) {
  if (!process.env.npm_execpath)
    throw Error("Run this script with npm run build");
  const result = spawnSync(
    process.execPath,
    [process.env.npm_execpath, ...args],
    {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, BASE_PATH: appBase },
    },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
run(["run", "build", "--workspace", "@chenxi/portfolio"], base);
run(["run", "build", "--workspace", "@chenxi/campaign-h5"], `${base}pulse/`);
run(["--prefix", "apps/commerce-mini", "run", "build:h5"], `${base}shop/`);
const output = resolve(root, "dist");
if (!output.startsWith(root + sep) || output !== resolve(root, "dist"))
  throw Error("Unsafe output path");
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(resolve(root, "apps/portfolio/dist"), output, { recursive: true });
cpSync(resolve(root, "apps/campaign-h5/dist"), resolve(output, "pulse"), {
  recursive: true,
});
cpSync(
  resolve(root, "apps/commerce-mini/dist/build/h5"),
  resolve(output, "shop"),
  { recursive: true },
);
mkdirSync(resolve(output, "evidence"), { recursive: true });
cpSync(resolve(root, "docs/research/assets"), resolve(output, "evidence"), {
  recursive: true,
});
for (const name of ["TEST_REPORT.md", "ARCHITECTURE.md", "PROJECT_SHOWCASE.md"])
  if (existsSync(resolve(root, name)))
    cpSync(resolve(root, name), resolve(output, "evidence", name));
for (const folder of ["acceptance", "intelligence-lab", "interview"])
  if (existsSync(resolve(root, "docs", folder)))
    cpSync(resolve(root, "docs", folder), resolve(output, "evidence", folder), {
      recursive: true,
    });
if (existsSync(resolve(root, "docs/screenshots")))
  cpSync(resolve(root, "docs/screenshots"), resolve(output, "screenshots"), {
    recursive: true,
  });
writeFileSync(resolve(output, ".nojekyll"), "");
writeFileSync(
  resolve(output, "build-meta.json"),
  JSON.stringify(
    {
      basePath: base,
      sourceRevision,
      builtAt: new Date().toISOString(),
      apps: ["portfolio", "shop", "pulse"],
    },
    null,
    2,
  ),
);
console.log(
  `Three independent applications assembled at ${output} (base: ${base})`,
);
