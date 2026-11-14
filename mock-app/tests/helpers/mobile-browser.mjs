import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { setImmediate as nextTurn } from "node:timers/promises";
import * as protocol from "../../shared/config/protocol-v4.mjs";

const [html, client, consultation, app] = await Promise.all([
  readFile(new URL("../../web/index.html", import.meta.url), "utf8"),
  readFile(new URL("../../web/shared/client-v4.mjs", import.meta.url), "utf8"),
  readFile(new URL("../../web/shared/consultation-v1.mjs", import.meta.url), "utf8"),
  readFile(new URL("../../web/app.js", import.meta.url), "utf8"),
]);

/** Entire production entry point + clients, actual HTTP; only DOM/timers are doubles. */
export async function mobileBrowser(base, memory = new Map()) {
  class Element {
    constructor(tag = "div") {
      this.tagName = tag.toUpperCase(); this.value = ""; this.textContent = "";
      this.checked = false; this.hidden = false; this.disabled = false;
      this.children = []; this.elements = []; this.dataset = {}; this.attributes = new Map();
      this.listeners = new Map();
    }
    addEventListener(type, callback) { this.listeners.set(type, callback); }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; }
  }
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1], new Element()]));
  elements.get("alias").value = "파도";
  const radios = ["a-01", "a-02"].map(value => Object.assign(new Element("input"), { value }));
  for (const radio of radios) Object.defineProperty(radio, "checked", {
    get() { return this._checked || false; },
    set(value) {
      if (value) for (const other of radios) other._checked = false;
      this._checked = value;
    },
  });
  radios[0].checked = true;
  const classes = new Map([".conversation", ".composer-area", ".journey-menu"].map(c => [c, new Element()]));
  const document = {
    hidden: false, activeElement: null,
    getElementById: id => elements.get(id),
    createElement: tag => new Element(tag),
    addEventListener() {},
    querySelector(selector) {
      if (classes.has(selector)) return classes.get(selector);
      if (selector.includes(":checked")) return radios.find(r => r.checked);
      const value = selector.match(/value="([^"]+)"/);
      if (value) return radios.find(r => r.value === value[1]);
      throw new Error(`Unsupported DOM selector: ${selector}`);
    },
    querySelectorAll(selector) {
      if (selector === "input[name=avatar]") return radios;
      if (selector === "[data-tone]") return [];
      throw new Error(`Unsupported DOM selector: ${selector}`);
    },
  };
  const storage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: key => memory.delete(key),
  };
  const source = [client, consultation].map(s => s.replace(/^export /gm, "")).join("\n")
    + "\n" + app.replace(/^import[\s\S]*?;\n/gm, "");
  const h = await runInNewContext(`(async () => { ${source}\nreturn {api, render, poll, busy:()=>busy}; })()`, {
    ...protocol, document, localStorage: storage, crypto: globalThis.crypto,
    AbortSignal, structuredClone, console,
    fetch: (path, options) => fetch(new URL(path, base), options),
    setInterval() {}, requestAnimationFrame: fn => fn(),
  });
  async function settle() {
    for (let i = 0; i < 500; i++) {
      await nextTurn();
      if (!h.busy()) return;
      await new Promise(resolve => setTimeout(resolve, 2));
    }
    throw new Error("Browser handler did not settle");
  }
  return {
    ...h, memory,
    handoff: async () => (await fetch(new URL("/api/handoff", base), {headers:{"X-Demo-Actor":"car"}})).json(),
    element: id => elements.get(id),
    scene: () => ({src:elements.get("scene-character").getAttribute("src"), alt:elements.get("scene-character").alt}),
    selected: () => radios.find(r => r.checked).value,
    async choose(value) {
      for (const r of radios) r.checked = r.value === value;
      radios.find(r => r.checked).listeners.get("change")(); await settle();
    },
    async click(id) { elements.get(id).onclick(); await settle(); },
    async confirmProfile() {
      elements.get("profile-next").onclick();
      elements.get("profile-form").onsubmit({preventDefault(){}}); await settle();
    },
    async editProfile() {
      const button = elements.get("steps").children.find(e => e.textContent === "나눈 이야기");
      button.onclick(); await settle();
    },
    reload: () => mobileBrowser(base, memory),
  };
}
