import {
  cp,
  mkdir,
  mkdtemp,
  rename,
  rm,
  readFile,
  writeFile,
  stat,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = new URL("../", import.meta.url);
const destination = new URL("runtime/first-pass/handoff/", root);
await mkdir(new URL("runtime/first-pass/", root), { recursive: true });
const bundle = pathToFileURL(
  (await mkdtemp(
    fileURLToPath(new URL("runtime/first-pass/handoff-stage-", root)),
  )) + "/",
);
const out = new URL("wayMate/mock-app/", bundle);
await mkdir(out, { recursive: true });
const excluded = new Set([
  "build",
  ".gradle",
  ".kotlin",
  ".idea",
  "captures",
  "local.properties",
  "key.properties",
]);
const includeSource = (path) =>
  !path.split("/").some((part) => excluded.has(part)) &&
  !basename(path).startsWith(".env") &&
  !/\.(jks|keystore)$/.test(path);

for (const path of [
  "server",
  "web",
  "shared",
  "assets",
  "scripts",
  "tests",
  "package.json",
  "package-lock.json",
  ".nvmrc",
  "README.md",
])
  await cp(new URL(path, root), new URL(path, out), {
    recursive: true,
    filter: includeSource,
  });
await cp(
  new URL("../docs_prototype/", root),
  new URL("wayMate/docs_prototype/", bundle),
  { recursive: true },
);
await cp(new URL("vehicle/", root), new URL("vehicle/", out), {
  recursive: true,
  filter: includeSource,
});
await writeFile(
  new URL("README.txt", bundle),
  "wayMate 1차 시연본\n시작 안내: wayMate/mock-app/README.md\n검수 기록: wayMate/docs_prototype/23_1차_개발_완료_및_검수.md\nNode 22.22.2에서 npm ci --ignore-scripts 후 npm start. APK는 wayMate/mock-app/apk. 개인 상태·SDK journal은 포함하지 않음.\n",
);
await mkdir(new URL("apk/", out), { recursive: true });
const manifest = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  gitHead: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: fileURLToPath(root),
    encoding: "utf8",
  }).trim(),
  apiPort: 3000,
  files: [],
};
for (const flavor of ["real", "mock"]) {
  const config = await readFile(
    new URL(
      `vehicle/app/build/generated/source/buildConfig/${flavor}/debug/com/waymate/app/BuildConfig.java`,
      root,
    ),
    "utf8",
  );
  if (!config.includes('"http://10.0.2.2:3000"'))
    throw new Error("기본 3000 포트로 두 APK를 빌드한 뒤 묶어 주세요.");
  const name = `app-${flavor}-debug.apk`,
    from = new URL(
      `vehicle/app/build/outputs/apk/${flavor}/debug/${name}`,
      root,
    );
  await cp(from, new URL(`apk/${name}`, out));
  const bytes = await readFile(from);
  manifest.files.push({
    path: `wayMate/mock-app/apk/${name}`,
    size: (await stat(from)).size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
await writeFile(
  new URL("build-manifest.json", bundle),
  JSON.stringify(manifest, null, 2) + "\n",
);
await rm(destination, { recursive: true, force: true });
await rename(bundle, destination);
console.log(fileURLToPath(destination));
