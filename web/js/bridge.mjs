/** The desktop side uses Tauri's built-in JS global, browser preview uses BroadcastChannel. */
const tauri = globalThis.__TAURI__;
const channel = !tauri && typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('desktop-cannon-v01') : null;
const localListeners = new Map();
if (channel) channel.onmessage = (e) => {
  const { name, payload } = e.data ?? {};
  for (const listener of localListeners.get(name) ?? []) listener(payload);
};
export const isTauri = Boolean(tauri);
export function listen(name, listener) {
  if (tauri) return tauri.event.listen(name, ({ payload }) => listener(payload));
  if (!localListeners.has(name)) localListeners.set(name, new Set());
  localListeners.get(name).add(listener);
  return Promise.resolve(() => localListeners.get(name)?.delete(listener));
}
export async function emit(name, payload) {
  if (tauri) return tauri.event.emit(name, payload);
  channel?.postMessage({ name, payload });
  for (const listener of localListeners.get(name) ?? []) listener(payload);
}
export async function startNativeWindowDrag() {
  if (!tauri?.window?.getCurrentWindow) throw new Error('Tauri window API unavailable');
  return tauri.window.getCurrentWindow().startDragging();
}
export async function getLayout() {
  if (tauri) {
    // WebView2 can start loading a hidden window before Rust has finished
    // registering application state. Retry briefly rather than losing layout.
    let error;
    for (let attempt = 0; attempt < 20; attempt++) {
      try { return await tauri.core.invoke('get_layout'); }
      catch (e) { error = e; await new Promise(resolve => setTimeout(resolve, 35)); }
    }
    throw error;
  }
  const w = window.parent === window ? window.innerWidth : window.parent.innerWidth;
  const h = window.parent === window ? window.innerHeight : window.parent.innerHeight;
  const rect = window.frameElement?.getBoundingClientRect();
  return { overlayX: 0, overlayY: 0, screenWidth: w, screenHeight: h,
    cannonX: rect?.left ?? w - 360 - 15, cannonY: rect?.top ?? h - 240 - 45,
    taskbarTop: h - 43, scaleFactor: 1 };
}
