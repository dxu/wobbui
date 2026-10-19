/**
 * wobbui builds HTML with JSX and updates only what changes.
 *
 * - JSX builds real elements, once: `<main className="p-8">` is an `HTMLElement`. There is no virtual DOM, and nothing
 *   re-renders.
 * - A signal holds a value that changes. Put a signal, or a function that reads signals, where a property or a child
 *   goes, and that one spot updates when the value changes.
 * - `mount(parent, () => <App />)` adds the HTML to `parent` and returns `unmount`, which removes it and stops every
 *   live spot in it.
 */

// Signals ------------------------------------------------------------------------------------------------------------

/** Runs a function again whenever a signal it read the last time changes, until it's stopped. */
class Watcher {
  readonly #run: () => void;
  readonly #sources = new Set<Set<Watcher>>();
  #stopped = false;

  constructor(run: () => void) {
    this.#run = run;
  }

  run(): void {
    if (this.#stopped) return;
    this.#unsubscribe();
    track(this, this.#run);
  }

  subscribe(watchers: Set<Watcher>): void {
    if (this.#stopped) return;
    watchers.add(this);
    this.#sources.add(watchers);
  }

  stop(): void {
    this.#stopped = true;
    this.#unsubscribe();
  }

  #unsubscribe(): void {
    for (const watchers of this.#sources) watchers.delete(this);
    this.#sources.clear();
  }
}

/** The watcher running now: every signal it reads subscribes it. */
let watching: Watcher | undefined;

/** Runs `run` with `watcher` as the one that the signals it reads subscribe, or none. */
function track<T>(watcher: Watcher | undefined, run: () => T): T {
  const outer = watching;
  watching = watcher;
  try {
    return run();
  } finally {
    watching = outer;
  }
}

/** A value that changes. Reading it in a live spot, or in `watch`, makes that run again when it changes. */
export class Signal<T> {
  #value: T;
  readonly #watchers = new Set<Watcher>();

  constructor(value: T) {
    this.#value = value;
  }

  /** The value now. Inside a live spot or `watch`, also subscribes it to changes. */
  get(): T {
    watching?.subscribe(this.#watchers);
    return this.#value;
  }

  /** Changes the value and, if it's a different value, runs everything that read it, before returning. */
  set(value: T): void {
    if (Object.is(value, this.#value)) return;
    this.#value = value;
    // A copy: a watcher that runs leaves the set and joins it again, and a set's loop would reach it a second time.
    for (const watcher of Array.from(this.#watchers)) watcher.run();
  }
}

/** A signal holding `value`. */
export function signal<T>(value: T): Signal<T> {
  return new Signal(value);
}

/**
 * Runs `run` now, and again whenever a signal it read changes. Returns `stop`. Called while HTML is being built, it
 * also stops when that HTML is removed.
 */
export function watch(run: () => void): () => void {
  const watcher = new Watcher(run);
  const stop = () => watcher.stop();
  building?.onDispose(stop);
  watcher.run();
  return stop;
}

/** Runs `read` without subscribing anything to the signals it reads. */
export function untracked<T>(read: () => T): T {
  return track(undefined, read);
}

// Scopes -------------------------------------------------------------------------------------------------------------

/**
 * Frees what was made while building a piece of HTML: its live spots, and the HTML a live spot built. A live spot's
 * HTML has a scope of its own, inside the one that built the spot, so rebuilding it frees only that part.
 */
class Scope {
  #cleanups: Set<() => void> | undefined = new Set();

  /** Runs `cleanup` when this scope is disposed, or now if it already was. */
  onDispose(cleanup: () => void): void {
    if (this.#cleanups === undefined) cleanup();
    else this.#cleanups.add(cleanup);
  }

  /** A scope disposed with this one, unless it's disposed first. */
  child(): Scope {
    const child = new Scope();
    const dispose = () => child.dispose();
    this.onDispose(dispose);
    child.onDispose(() => this.#cleanups?.delete(dispose));
    return child;
  }

  /** Runs every cleanup, newest first. If one throws, the rest still run, and the first error is rethrown. */
  dispose(): void {
    const cleanups = this.#cleanups;
    if (cleanups === undefined) return;
    this.#cleanups = undefined;
    let failure: { error: unknown } | undefined;
    const newestLast = Array.from(cleanups);
    for (let cleanup = newestLast.pop(); cleanup !== undefined; cleanup = newestLast.pop()) {
      try {
        cleanup();
      } catch (error) {
        failure ??= { error };
      }
    }
    if (failure !== undefined) throw failure.error;
  }
}

/** The scope of the HTML being built now, if any. */
let building: Scope | undefined;

function within<T>(scope: Scope, make: () => T): T {
  const outer = building;
  building = scope;
  try {
    return make();
  } finally {
    building = outer;
  }
}

// Building -----------------------------------------------------------------------------------------------------------

/** What JSX accepts as a child. */
export type Child =
  | Node
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | Signal<unknown>
  | (() => Child)
  | readonly Child[];

/** What a live spot shows: a plain value, a signal, or a function that reads signals. */
export type Live<T> = T | Signal<T> | (() => T);

/**
 * Builds the HTML `build` returns and adds it to `parent`. Returns `unmount`, which removes the HTML and stops every
 * live spot in it. Called while other HTML is being built, it's also unmounted when that HTML is removed, so a dialog
 * can mount itself on `document.body` and still go with the component that opened it.
 */
export function mount(parent: Node, build: () => JSX.Element): () => void {
  const scope = new Scope();
  const unmount = () => scope.dispose();
  let html: JSX.Element;
  try {
    html = within(scope, () => untracked(build));
  } catch (error) {
    unmount();
    throw error;
  }
  const nodes = html instanceof DocumentFragment ? [...html.childNodes] : [html];
  parent.appendChild(html);
  scope.onDispose(() => {
    for (const node of nodes) node.parentNode?.removeChild(node);
  });
  building?.onDispose(unmount);
  return unmount;
}

type Component = (props: Record<string, unknown>) => JSX.Element;

/** What JSX compiles to: builds an element, or calls a component, which runs once and subscribes nothing. */
export function jsx(type: string | Component, props: Record<string, unknown>): JSX.Element {
  if (typeof type === "function") return untracked(() => type(props));
  const element = document.createElement(type);
  const later: string[] = [];
  for (const name in props) {
    if (name === "children" || name === "ref") continue;
    if (LATER.has(name)) later.push(name);
    else setProperty(element, name, props[name]);
  }
  append(element, props["children"] as Child);
  for (const name of later) setProperty(element, name, props[name]);
  const ref = props["ref"];
  if (typeof ref === "function") ref(element);
  return element;
}

/**
 * The properties set last, after the others and the children, so that a select already has its options and a range
 * input its `min` and `max` when its value is set.
 */
const LATER = new Set(["value", "valueAsNumber", "valueAsDate", "checked", "indeterminate", "selectedIndex"]);

/** `<>…</>`: its children, with nothing around them. */
export function Fragment(props: { children?: Child }): DocumentFragment {
  const fragment = document.createDocumentFragment();
  append(fragment, props.children);
  return fragment;
}

function setProperty(element: HTMLElement, name: string, value: unknown): void {
  if (name.startsWith("on")) {
    (element as unknown as Record<string, unknown>)[name] = value;
  } else if (isLive(value)) {
    currentScope();
    watch(() => assign(element, name, latest(value)));
  } else {
    assign(element, name, value);
  }
}

/** Sets a DOM property by its own name, or an attribute when the name has a dash or isn't a property. */
function assign(element: HTMLElement, name: string, value: unknown): void {
  if (name === "style") element.style.cssText = value === null || value === undefined ? "" : String(value);
  else if (!name.includes("-") && name in element) (element as unknown as Record<string, unknown>)[name] = value;
  else if (value === null || value === undefined || value === false) element.removeAttribute(name);
  else element.setAttribute(name, value === true ? "" : String(value));
}

function currentScope(): Scope {
  if (building === undefined) throw new Error("wobbui: a live value only works in HTML built by mount().");
  return building;
}

function isLive(value: unknown): value is Signal<unknown> | (() => unknown) {
  return value instanceof Signal || typeof value === "function";
}

/** A live value's value now. */
function latest(live: Signal<unknown> | (() => unknown)): unknown {
  return live instanceof Signal ? live.get() : live();
}

function append(parent: Node, child: Child): void {
  if (child === null || child === undefined || typeof child === "boolean") return;
  if (Array.isArray(child)) {
    for (const each of child as readonly Child[]) append(parent, each);
  } else if (child instanceof Node) {
    parent.appendChild(child);
  } else if (isLive(child)) {
    liveSpot(parent, child);
  } else {
    parent.appendChild(document.createTextNode(String(child)));
  }
}

/**
 * A child that changes. Text changes in place. Anything else is rebuilt whenever a signal the function read changes:
 * the HTML it showed before is removed, and its own live spots stop.
 */
function liveSpot(parent: Node, live: Signal<unknown> | (() => unknown)): void {
  const owner = currentScope();
  const end = parent.appendChild(document.createTextNode(""));
  let text: Text | undefined;
  let shown: Scope | undefined;
  watch(() => {
    // HTML a function builds while it's read belongs to `next`, so rebuilding frees it.
    let next: Scope | undefined;
    const value = typeof live === "function" ? within((next = owner.child()), live) : live.get();
    if (text !== undefined && isText(value)) {
      text.data = String(value);
      next?.dispose();
      return;
    }
    next ??= owner.child();
    shown?.dispose();
    shown = next;
    const fragment = document.createDocumentFragment();
    within(next, () => untracked(() => append(fragment, value as Child)));
    text = isText(value) ? (fragment.firstChild as Text) : undefined;
    const nodes = [...fragment.childNodes];
    next.onDispose(() => {
      for (const node of nodes) node.parentNode?.removeChild(node);
    });
    end.parentNode?.insertBefore(fragment, end);
  });
}

function isText(value: unknown): value is string | number | bigint {
  return typeof value === "string" || typeof value === "number" || typeof value === "bigint";
}

// Types for JSX ------------------------------------------------------------------------------------------------------

type IfEquals<X, Y, Then, Else> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? Then : Else;

/** The properties of `E` JSX can set: not read-only, not methods, not handlers, and not `style`, which takes text. */
type Settable<E> = {
  [K in keyof E]-?: K extends `on${string}` | "style"
    ? never
    : E[K] extends (...args: never[]) => unknown
      ? never
      : IfEquals<{ [P in K]: E[K] }, { -readonly [P in K]: E[K] }, K, never>;
}[keyof E];

/** The event an element's `on…` property hands its handler. */
type EventOf<Handler> = Handler extends ((this: never, event: infer E) => unknown) | null ? E : Event;

/** What JSX takes for an element `E`. A text property takes a number too, as in `min={0}`. */
export type Props<E extends HTMLElement> = {
  [K in Settable<E>]?: Live<E[K] extends string ? E[K] | number : E[K]>;
} & {
  [K in keyof E as K extends `on${string}` ? K : never]?: (event: EventOf<E[K]> & { currentTarget: E }) => void;
} & {
  children?: Child;
  ref?: (element: E) => void;
  style?: Live<string>;
  [attribute: `data-${string}` | `aria-${string}`]: Live<string | number | boolean | null | undefined>;
};

export declare namespace JSX {
  type Element = Node;
  interface ElementChildrenAttribute {
    children: unknown;
  }
  type IntrinsicElements = { [K in keyof HTMLElementTagNameMap]: Props<HTMLElementTagNameMap[K]> };
}
