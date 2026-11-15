import { access, copyFile, readFile, writeFile, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { startServer } from "../server/v4/http.mjs";
import { validateStore } from "../server/v4/state.mjs";
import { dialogueContext } from "../server/ai/vehicle-dialogue.mjs";

const exists = async (file) => { try { await access(file); return true; } catch(e) { if(e.code==="ENOENT")return false;throw e; } };
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Frozen, separate rehearsal; carries no external AI or speech provider. */
export async function preparePleosValidation({
  source = resolve("runtime/gangneung-20261214.json"),
  file = resolve("runtime/pleos-validation-gangneung-20261214.json"),
  refresh = false,
} = {}) {
  source=resolve(source);file=resolve(file);
  if (file===source) throw new Error("Validation state must be separate from the original");
  const baseline=file+".baseline", baselineCache=baseline+".dialogue.json";
  for(const path of [file+".lock",file+".dialogue.json.lock"])
    if(await exists(path)) throw new Error("Stop the validation server before refreshing its isolated state");
  await mkdir(dirname(file),{recursive:true});
  if (!(await exists(baseline))) {
    const bytes=await readFile(source), snapshot=JSON.parse(bytes);
    validateStore(snapshot);
    if(snapshot.vehicleActivation || !snapshot.handoff || snapshot.social.connection.status!=="linked")
      throw new Error("The source must be a prepared, connected journey before vehicle activation");
    const context=dialogueContext(snapshot,0,{preparing:true});
    const cacheBytes=await readFile(source+".dialogue.json"), cache=JSON.parse(cacheBytes);
    if(cache.scope!==context.scope || cache.entries?.[context.key]?.source!=="openai")
      throw new Error("A reviewed dialogue packet for the prepared source is required");
    await writeFile(baseline,bytes,{flag:"wx",mode:0o600});
    await writeFile(baselineCache,cacheBytes,{flag:"wx",mode:0o600});
    await writeFile(file+".snapshot.json",JSON.stringify({source,scope:context.scope,contextKey:context.key,
      stateSha256:sha(bytes),dialogueSha256:sha(cacheBytes),externalProvidersEnabled:false},null,2)+"\n",{flag:"wx",mode:0o600});
  }
  if(refresh || !(await exists(file))) {
    await copyFile(baseline,file,refresh?0:constants.COPYFILE_EXCL);
    await copyFile(baselineCache,file+".dialogue.json",refresh?0:constants.COPYFILE_EXCL);
  }
  return {file,baseline,metadata:JSON.parse(await readFile(file+".snapshot.json","utf8"))};
}

async function main() {
  const port=Number(process.env.WAYMATE_VALIDATION_PORT||3015);
  if(!Number.isInteger(port)||port<1024||port>65535||port===3000||port===3004)
    throw new Error("Use a separate validation port");
  const prepared=await preparePleosValidation({refresh:process.argv.includes("--refresh")});
  const app=await startServer({file:prepared.file,port,aiProvider:null,speechProvider:null,dialogueProvider:null});
  console.log(JSON.stringify({ready:true,port,file:prepared.file,scope:prepared.metadata.scope,
    contextKey:prepared.metadata.contextKey,externalProvidersEnabled:false,dialogue:"saved-packet-only",ttsAvailable:false}));
  for(const signal of ["SIGINT","SIGTERM"]) process.once(signal,async()=>{await app.close();process.exit(0);});
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch((e)=>{console.error("Pleos validation startup failed:",e.message);process.exitCode=1;});
