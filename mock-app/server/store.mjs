import { open, readFile, rename, unlink, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
// State and receipts share one fsync + rename boundary. Inject faults only in tests.
export async function atomicSave(file, data, fault = () => {}) {
  const tmp = `${file}.${randomUUID()}.tmp`;
  let renamed = false;
  try {
    const h = await open(tmp, "wx", 0o600);
    try {
      await h.writeFile(JSON.stringify(data));
      await h.sync();
    } finally {
      await h.close();
    }
    fault("beforeRename");
    await rename(tmp, file);
    renamed = true;
    fault("afterRename");
    const dir = await open(dirname(file), "r");
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
  } catch (e) {
    e.uncertain = renamed;
    throw e;
  } finally {
    await unlink(tmp).catch(() => {});
  }
}
export async function openStore(file, initial, validate) {
  await mkdir(dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  const h = await open(lock, "wx", 0o600); // Never run two writers, including independent server ports.
  await h.writeFile(String(process.pid));
  await h.close();
  try {
    let data;
    try {
      data = JSON.parse(await readFile(file, "utf8"));
      validate(data);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      data = initial();
      await atomicSave(file, data);
    }
    return { data, release: () => unlink(lock) };
  } catch (e) {
    await unlink(lock);
    throw e;
  }
}
