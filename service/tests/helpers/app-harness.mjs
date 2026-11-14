import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
// Run the shipped browser handlers with controlled I/O; rendering is observed, not reimplemented.
export async function appHarness(api) {
  const source = await readFile(
    new URL("../../web/app.js", import.meta.url),
    "utf8",
  );
  const boot = source.indexOf("\ntry {\n  await refresh();");
  if (boot < 0) throw new Error("Browser bootstrap boundary changed");
  const storage = new Map(),
    elements = new Map(),
    listeners = new Map();
  const stats = { draws: 0, notices: [], displayed: null, streams: [] };
  const element = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        value: "",
        innerHTML: "",
        hidden: false,
        disabled: false,
        addEventListener() {},
        focus() {},
        classList: { toggle() {} },
        setAttribute() {},
        reset() {},
        open: false,
        close() {
          this.open = false;
        },
        showModal() {
          this.open = true;
        },
      });
    return elements.get(id);
  };
  const context = {
    crypto: webcrypto,
    ServiceClient: class {
      constructor() {
        return api;
      }
    },
    document: {
      getElementById: element,
      querySelector: element,
      querySelectorAll: () => [],
      addEventListener(type, fn) {
        listeners.set(type, fn);
      },
    },
    location: { hash: "#home" },
    localStorage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    },
    addEventListener() {},
    requestAnimationFrame(fn) {
      fn();
    },
    setTimeout,
    clearTimeout,
    console,
    EventSource: class {
      constructor(url) {
        this.url = url;
        this.events = new Map();
        this.closed = false;
        stats.streams.push(this);
      }
      addEventListener(type, fn) {
        this.events.set(type, fn);
      }
      close() {
        this.closed = true;
      }
      async emit(type, data) {
        return this.events.get(type)?.({ data: JSON.stringify(data) });
      }
    },
    stats,
  };
  context.window = {
    history: {
      replaceState(_state, _title, hash) {
        context.location.hash = hash;
      },
    },
  };
  vm.runInNewContext(
    source.slice(0, boot).replace(/^import .*?;\n/, "") +
      `
    draw=()=>{stats.draws++;stats.displayed=S.chat?.id??S.view;};
    renderChrome=()=>{};updateComposer=()=>{};scrollBottom=()=>{};
    notice=message=>stats.notices.push(message);refresh=async()=>{};
    globalThis.app={S,route,newChat,stream,turnView,identity,refreshVehicles,reviewVehicleSend,vehicleAction,vehicleTripControls,submit:$('message-form').onsubmit};
  `,
    context,
  );
  return {
    ...context.app,
    storage,
    stats,
    input: element("message"),
    context,
    async navigate(hash) {
      context.location.hash = hash;
      await context.app.route();
    },
    async click(action, data = {}) {
      return listeners.get("click")({
        target: {
          closest: () => ({ dataset: { action, ...data }, disabled: false }),
        },
      });
    },
  };
}
