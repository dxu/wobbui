// Installs a browser simulated by happy-dom as the globals wobbui uses. Each test file runs in its own process, so each
// gets its own browser.
import { Window } from "happy-dom";

export const browser = new Window();

Object.assign(globalThis, {
  document: browser.document,
  Node: browser.Node,
  DocumentFragment: browser.DocumentFragment,
});

/** An element to mount into, outside the page. */
export function host(): HTMLElement {
  return document.createElement("div");
}

/** Fires `type` on `target`, as the browser does when the user acts on it. */
export function fire(target: EventTarget, type: string): void {
  target.dispatchEvent(new browser.Event(type) as unknown as Event);
}
