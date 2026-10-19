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

/** How many times in a row a watcher may change a signal it reads before wobbui gives up on it settling. */
const MAX_RUNS = 100;

/** Runs a function again whenever a signal it read the last time changes, until it's stopped. */
class Watcher {
  readonly #run: () => void;
  readonly #sources = new Set<Set<Watcher>>();
  #stopped = false;
  #running = false;
  #again = false;

  constructor(run: () => void) {
    this.#run = run;
  }

  run(): void {
    if (this.#stopped) return;
    // A run that changes a signal it read asks for one more run, after this one, so the last run sees the last value.
    if (this.#running) {
      this.#again = true;
      return;
    }
    this.#running = true;
    // A run that throws still gets the run it asked for, so the last run sees the last value. The first error is
    // rethrown after, even when the runs never settle: it says more than running out of runs does.
    let failure: { error: unknown } | undefined;
    try {
      let runs = 0;
      do {
        if (++runs > MAX_RUNS) {
          failure ??= { error: new Error("wobbui: a watcher kept changing a signal it reads.") };
          break;
        }
        this.#again = false;
        this.#unsubscribe();
        try {
          track(this, this.#run);
        } catch (error) {
          failure ??= { error };
        }
      } while (this.#again && !this.#stopped);
    } finally {
      this.#running = false;
      this.#again = false;
    }
    if (failure !== undefined) throw failure.error;
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
    if (watching !== undefined) watching.subscribe(this.#watchers);
    else if (warnings && building !== undefined) warnOfRead(this);
    return this.#value;
  }

  /**
   * Changes the value and, if it's a different value, runs everything that read it, before returning. If one of them
   * throws, the rest still run, and the first error is rethrown.
   */
  set(value: T): void {
    if (Object.is(value, this.#value)) return;
    this.#value = value;
    // A copy: a watcher that runs leaves the set and joins it again, and a set's loop would reach it a second time.
    forEach(Array.from(this.#watchers), (watcher) => watcher.run());
  }
}

/** A signal holding `value`. */
export function signal<T>(value: T): Signal<T> {
  return new Signal(value);
}

/**
 * Runs `run` now, and again whenever a signal it read changes. Returns `stop`. Called while HTML is being built, it
 * also stops when that HTML is removed. What a run starts, such as another `watch` or an `onCleanup`, is stopped
 * before the next run. A cleanup that throws doesn't stop the next run; its error is rethrown after it.
 */
export function watch(run: () => void): () => void {
  const owner = building;
  let pass: Scope | undefined;
  const endPass = () => {
    const ended = pass;
    pass = undefined;
    ended?.dispose();
  };
  return bind(() => {
    // The run goes ahead even when ending the last one throws: it reads the signals that run it again, so skipping it
    // would leave the watch listening to nothing, never to run again.
    let failure: { error: unknown } | undefined;
    try {
      endPass();
    } catch (error) {
      failure = { error };
    }
    pass = owner === undefined ? new Scope() : owner.child();
    try {
      within(pass, run);
    } catch (error) {
      failure ??= { error };
    }
    if (failure !== undefined) throw failure.error;
  }, endPass);
}

/**
 * Stands in for a watcher inside `untracked`: the signals read there subscribe nothing, and the reads are on purpose.
 * Anything that runs a watcher of its own inside, such as a `set` that rebuilds part of the page, sets its own.
 */
const QUIET = new Watcher(() => {});
QUIET.stop();

/**
 * Runs `read` without subscribing anything to the signals it reads. Reading a signal once on purpose while HTML is
 * built, such as to start a form from a saved value, goes in here, so it isn't warned about.
 */
export function untracked<T>(read: () => T): T {
  return track(QUIET, read);
}

/** Runs `run` as the page would, outside anything being built or watched: for event handlers and cleanups. */
function outside<T>(run: () => T): T {
  const outer = building;
  building = undefined;
  try {
    return track(undefined, run);
  } finally {
    building = outer;
  }
}

/** Whether wobbui warns about likely mistakes. */
let warnings = false;

/** The signals already warned about, so a mistake in a list or in a part rebuilt every frame warns once. */
const warned = new WeakSet<Signal<unknown>>();

/**
 * Turns wobbui's warnings on or off. They're off unless turned on, and wobbui's development build, which bundlers such
 * as Vite pick while developing, turns them on.
 */
export function setWarnings(on: boolean): void {
  warnings = on;
}

/** Warns, once per signal, that `source` was read while HTML was built, outside anything that would read it again. */
function warnOfRead(source: Signal<unknown>): void {
  if (warned.has(source)) return;
  warned.add(source);
  console.warn(
    "wobbui: a signal was read while building HTML, outside a function, so what it shows won't update. " +
      "Pass the signal itself, as {volume}, or a function, as {() => volume.get()}. " +
      "If you meant to read it once, wrap the read in untracked().",
  );
}

/**
 * Runs `cleanup` when what's being built now goes away: when its HTML is unmounted or rebuilt, or when the `watch` it's
 * called in runs again or stops. Use it for what wobbui doesn't know about, such as a timer or a listener on `window`.
 */
export function onCleanup(cleanup: () => void): void {
  currentScope("onCleanup").onDispose(cleanup);
}

/** Starts a watcher for `run`, stopped with the HTML being built, if any. Returns `stop`, which also runs `onStop`. */
function bind(run: () => void, onStop?: () => void): () => void {
  const watcher = new Watcher(run);
  const stop = () => {
    watcher.stop();
    onStop?.();
  };
  building?.onDispose(stop);
  try {
    watcher.run();
  } catch (error) {
    rethrowAfter(error, stop);
  }
  return stop;
}

/**
 * Runs `cleanup` after `error` stopped something, then rethrows `error`. An error from `cleanup` is dropped: the first
 * error says what went wrong, as `set` rethrows only the first.
 */
function rethrowAfter(error: unknown, cleanup: () => void): never {
  try {
    cleanup();
  } catch {
    // Dropped: the first error is the one rethrown.
  }
  throw error;
}

/** Calls `act` for each item. If one throws, the rest still run, and the first error is rethrown. */
function forEach<T>(items: readonly T[], act: (item: T) => void): void {
  let failure: { error: unknown } | undefined;
  for (const item of items) {
    try {
      act(item);
    } catch (error) {
      failure ??= { error };
    }
  }
  if (failure !== undefined) throw failure.error;
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
    const newestLast = Array.from(cleanups);
    const newestFirst: (() => void)[] = [];
    for (let cleanup = newestLast.pop(); cleanup !== undefined; cleanup = newestLast.pop()) newestFirst.push(cleanup);
    // Outside the watcher that may be rebuilding, so a signal a cleanup reads doesn't subscribe it.
    outside(() => forEach(newestFirst, (cleanup) => cleanup()));
  }
}

/** The scope of what's being built now: HTML inside `mount`, a live spot rebuilding, or a run of `watch`. */
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

function currentScope(what: string): Scope {
  if (building !== undefined) return building;
  throw new Error(`wobbui: ${what} only works inside mount() or watch(), which can stop it.`);
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
  | Signal<Child>
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
  try {
    const html = within(scope, () => track(undefined, build));
    // The HTML is whatever lies between two markers, so unmounting removes what's there then: an element that another
    // mount or a live spot has taken since stays where it went. The markers go in first, so a parent that refuses the
    // HTML refuses it before it leaves wherever it was.
    const start = marker();
    const end = marker();
    scope.onDispose(() => {
      clear(start, end);
      start.remove();
      end.remove();
    });
    parent.appendChild(start);
    parent.appendChild(end);
    parent.insertBefore(html, end);
  } catch (error) {
    rethrowAfter(error, unmount);
  }
  building?.onDispose(unmount);
  return unmount;
}

/**
 * An empty comment marking where some HTML starts or ends. A comment, not text: a document accepts it as a child, and
 * `normalize()` keeps it, where it removes an empty text node.
 */
function marker(): Comment {
  return document.createComment("");
}

/** Removes the nodes between `start` and `end`. */
function clear(start: Node, end: Node): void {
  for (let node = start.nextSibling; node !== null && node !== end; node = start.nextSibling) node.remove();
}

type Component = (props: Record<string, unknown>) => JSX.Element;

/** What JSX compiles to: builds an element, or calls a component, which runs once and subscribes nothing. */
export function jsx(type: string | Component, props: Record<string, unknown>): JSX.Element {
  if (typeof type === "function") return track(undefined, () => type(props));
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
    // A handler can run while HTML is still being built, as when building focuses an input, so it runs as the page
    // would run it: subscribing nothing, and its reads not warned about.
    (element as unknown as Record<string, unknown>)[name] =
      typeof value === "function"
        ? function (this: unknown, ...args: unknown[]) {
            return outside(() => (value as (...args: unknown[]) => unknown).apply(this, args));
          }
        : value;
  } else if (isLive(value)) {
    currentScope("A live value");
    bind(() => assign(element, name, latest(value)));
  } else {
    assign(element, name, value);
  }
}

/** The attribute a property reflects, where its name isn't the property's own. */
const ATTRIBUTE_OF = new Map([
  ["className", "class"],
  ["htmlFor", "for"],
]);

/** What a property goes back to when it's given `null` or `undefined`, where removing its attribute wouldn't do it. */
const EMPTY = new Map<string, unknown>([
  ["value", ""],
  ["checked", false],
  ["indeterminate", false],
  ["textContent", ""],
]);

/**
 * Sets a DOM property by its own name, or an attribute when the name has a dash or isn't a property. `null` and
 * `undefined` clear it. An `aria-` or `data-` attribute writes `true` and `false` out, as ARIA reads them.
 */
function assign(element: HTMLElement, name: string, value: unknown): void {
  const properties = element as unknown as Record<string, unknown>;
  if (name === "style") {
    element.style.cssText = value === null || value === undefined ? "" : String(value);
  } else if (name.includes("-") || !(name in element)) {
    const dashed = name.includes("-");
    if (value === null || value === undefined || (value === false && !dashed)) element.removeAttribute(name);
    else element.setAttribute(name, value === true && !dashed ? "" : String(value));
  } else if (value === null || value === undefined) {
    if (EMPTY.has(name)) properties[name] = EMPTY.get(name);
    else element.removeAttribute(ATTRIBUTE_OF.get(name) ?? name);
  } else {
    try {
      properties[name] = value;
    } catch {
      // A property that can only be read, such as an input's `list`: its attribute sets it.
      element.setAttribute(name, String(value));
    }
  }
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
 * A child that changes. Its HTML is whatever lies between two markers it adds to `parent`, so removing that HTML
 * removes what's there then: an element the new HTML, or another live spot, has taken since stays where it went.
 * Text changes in place. Anything else is rebuilt whenever a signal the function read changes: the HTML it showed
 * before is removed, and its own live spots stop. A cleanup of the old HTML that throws doesn't stop the new HTML from
 * showing. If the function throws, the old HTML stays; if a function child it returns throws on its first run, the spot
 * shows nothing until the next change. Either way, what the failed HTML started stops.
 */
function liveSpot(parent: Node, live: Signal<unknown> | (() => unknown)): void {
  const owner = currentScope("A live value");
  const start = parent.appendChild(marker());
  const end = parent.appendChild(marker());
  const removeShown = () => clear(start, end);
  let text: Text | undefined;
  let shown: Scope | undefined;
  bind(() => {
    // HTML a function builds while it's read belongs to `next`, so rebuilding frees it.
    let next: Scope | undefined;
    let value: unknown;
    if (live instanceof Signal) {
      value = live.get();
    } else {
      next = owner.child();
      try {
        value = within(next, live);
      } catch (error) {
        rethrowAfter(error, () => next?.dispose());
      }
    }
    // Text changes in place, unless the page has removed its node, as `normalize()` removes an empty one.
    if (text !== undefined && text.parentNode !== null && isText(value)) {
      text.data = String(value);
      next?.dispose();
      return;
    }
    next ??= owner.child();
    // The old HTML goes before the value is added, so an element the function returns again stays on the page. If a
    // cleanup of the old throws, the new HTML still shows, and the error is rethrown once it does.
    let failure: { error: unknown } | undefined;
    try {
      shown?.dispose();
    } catch (error) {
      failure = { error };
    }
    shown = next;
    text = undefined;
    const fragment = document.createDocumentFragment();
    try {
      within(next, () => track(undefined, () => append(fragment, value as Child)));
    } catch (error) {
      rethrowAfter(failure === undefined ? error : failure.error, () => next?.dispose());
    }
    text = isText(value) ? (fragment.firstChild as Text) : undefined;
    next.onDispose(removeShown);
    end.parentNode?.insertBefore(fragment, end);
    if (failure !== undefined) throw failure.error;
  });
}

function isText(value: unknown): value is string | number | bigint {
  return typeof value === "string" || typeof value === "number" || typeof value === "bigint";
}

// Types for JSX ------------------------------------------------------------------------------------------------------

type IfEquals<X, Y, Then, Else> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? Then : Else;

/**
 * The properties of `E` JSX can set: named ones only (a form's index signature would accept anything), not read-only,
 * not methods, not handlers, and not `style`, which takes text.
 */
type Settable<E> = {
  [K in keyof E]-?: string extends K
    ? never
    : number extends K
      ? never
      : K extends `on${string}` | "style"
        ? never
        : E[K] extends (...args: never[]) => unknown
          ? never
          : IfEquals<{ [P in K]: E[K] }, { -readonly [P in K]: E[K] }, K, never>;
}[keyof E];

/** The event an element's `on…` property hands its handler. */
type EventOf<Handler> = NonNullable<Handler> extends (this: never, event: infer E) => unknown ? E : Event;

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
