import { cp, mkdir, mkdtemp, rename, rm, readFile, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const demoRoot = new URL("../", import.meta.url);
const repository = new URL("../../../", import.meta.url);
const destination = new URL("runtime/first-pass/handoff/", demoRoot);
await mkdir(new URL("runtime/first-pass/", demoRoot), { recursive: true });
const bundle = pathToFileURL((await mkdtemp(fileURLToPath(new URL("runtime/first-pass/handoff-stage-", demoRoot)))) + "/");
const out = new URL("wayMate/", bundle);
await mkdir(out, { recursive: true });
const excluded = new Set(["node_modules", "runtime", "output", "build", ".gradle", ".kotlin", ".idea", ".cache", ".playwright-cli", "__pycache__", "captures", "local.properties", "key.properties"]);
const includeSource = (path) => !path.split("/").some((part) => excluded.has(part)) && (!basename(path).startsWith(".env") || basename(path) === ".env.example" || /^\.env\..+\.example$/.test(basename(path))) && !/\.(jks|keystore|pyc)$/.test(path);

// Keep the same role-based layout in the handoff bundle as in the repository.
for (const path of ["backend", "mobile-web", "vehicle-app", "shared", "assets", "package.json", ".nvmrc", "README.md"])
  await cp(new URL(path, repository), new URL(path, out), { recursive: true, filter: includeSource });
for (const path of ["backend/runtime/", "backend/demo/runtime/"])
  await mkdir(new URL(path, out), { recursive: true });
await writeFile(new URL("README.txt", bundle), "두루밋 시연본\n시작 안내: wayMate/README.md\nNode 22.22.2에서 npm run setup 후 npm run start:demo.\nAPK: wayMate/vehicle-app/apk/\n개인 상태·환경 설정·SDK journal은 포함하지 않음.\n");
await mkdir(new URL("vehicle-app/apk/", out), { recursive: true });
const manifest = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  gitHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: fileURLToPath(repository), encoding: "utf8" }).trim(),
  apiPort: 3000,
  files: [],
};
for (const flavor of ["real", "mock"]) {
  const config = await readFile(new URL(`vehicle-app/app/build/generated/source/buildConfig/${flavor}/debug/com/waymate/app/BuildConfig.java`, repository), "utf8");
  if (!config.includes('"http://10.0.2.2:3000"')) throw new Error("기본 3000 포트로 두 APK를 빌드한 뒤 묶어 주세요.");
  const name = `app-${flavor}-debug.apk`;
  const from = new URL(`vehicle-app/app/build/outputs/apk/${flavor}/debug/${name}`, repository);
  await cp(from, new URL(`vehicle-app/apk/${name}`, out));
  const bytes = await readFile(from);
  manifest.files.push({ path: `wayMate/vehicle-app/apk/${name}`, size: (await stat(from)).size, sha256: createHash("sha256").update(bytes).digest("hex") });
}
await writeFile(new URL("build-manifest.json", bundle), JSON.stringify(manifest, null, 2) + "\n");
await rm(destination, { recursive: true, force: true });
await rename(bundle, destination);
console.log(fileURLToPath(destination));
