/**
 * wobbui builds HTML with JSX and updates only what changes.
 *
 * - JSX builds real elements, once: `<main className="p-8">` is an `HTMLElement`. There is no virtual DOM, and nothing
 *   re-renders.
 * - A signal holds a value that changes. Put a signal, or a function that reads signals, where a property or a child
 *   goes, and that one spot updates when the value changes.
 * - `mount(parent, () => <App />)` adds the HTML to `parent` and returns `unmount`, which stops every live spot in it
 *   and then removes it.
 */

// Signals ------------------------------------------------------------------------------------------------------------

/** How many times one flush may run a watcher before wobbui gives up on it settling. */
const MAX_RUNS = 100;

/** How stale a reader is: nothing it read has changed, a computed value it read may have, or something it read has. */
const CLEAN = 0;
const CHECK = 1;
const DIRTY = 2;
type State = typeof CLEAN | typeof CHECK | typeof DIRTY;

/** What reads signals, a watcher or a computed value, and is told when something it read may have changed. */
class Reader {
  /** What it read the last time it ran: each source's set of readers, mapped to the source, in the order it read it. */
  readonly #sources = new Map<Set<Reader>, ReadonlySignal<unknown>>();
  readonly #told: () => void;
  #state: State;
  #stopped = false;

  constructor(told: () => void, state: State = CLEAN) {
    this.#told = told;
    this.#state = state;
  }

  subscribe(readers: Set<Reader>, source: ReadonlySignal<unknown>): void {
    if (this.#stopped) return;
    readers.add(this);
    this.#sources.set(readers, source);
  }

  /** The first mark since it was clean tells it: a watcher joins the queue, and a computed value marks its readers. */
  mark(state: State): void {
    if (this.#state >= state) return;
    const told = this.#state === CLEAN;
    this.#state = state;
    if (told) this.#told();
  }

  stop(): void {
    this.#stopped = true;
    this.#leave();
  }

  /** Runs `read`, subscribing this reader to what it reads, and to nothing it read before. */
  track<T>(read: () => T): T {
    this.#leave();
    return track(this, read);
  }

  /** Whether something it read has changed. It's left clean, so a change made while it runs tells it again. */
  stale(): boolean {
    // Brings computed values it read up to date, in order, until one has changed: the next run may not read the rest.
    if (this.#state === CHECK) {
      untracked(() => {
        for (const source of this.#sources.values()) {
          try {
            source.get();
          } catch {
            // One that throws now has marked this dirty, and the next run reads the error.
          }
          if (this.#state === DIRTY) break;
        }
      });
    }
    const stale = this.#state === DIRTY && !this.#stopped;
    this.#state = CLEAN;
    return stale;
  }

  #leave(): void {
    for (const readers of this.#sources.keys()) readers.delete(this);
    this.#sources.clear();
  }
}

/** The reader running now: every signal it reads subscribes it. */
let watching: Reader | undefined;

/** Runs `run` with `reader` as the one that the signals it reads subscribe, or none. */
function track<T>(reader: Reader | undefined, run: () => T): T {
  const outer = watching;
  watching = reader;
  try {
    return run();
  } finally {
    watching = outer;
  }
}

/** Subscribes the reader running now to `source`, or warns of a read while HTML is built outside any reader. */
function onRead(source: ReadonlySignal<unknown>, readers: Set<Reader>): void {
  if (watching !== undefined) watching.subscribe(readers, source);
  else if (warnings && building !== undefined) warnOfRead(source);
}

/** A value that changes. Reading it in a live spot, `watch` or a computed value runs that again when it changes. */
export class Signal<T> {
  #value: T;
  readonly #readers = new Set<Reader>();

  constructor(value: T) {
    this.#value = value;
  }

  /** The value now. Inside a live spot, `watch` or a computed value, also subscribes it to changes. */
  get(): T {
    onRead(this, this.#readers);
    return this.#value;
  }

  /**
   * Changes the value and, if it's a different value, runs everything that read it, before returning or once its batch
   * is done. If one of them throws, the rest still run, and the first error is rethrown unless a `catchError` takes it.
   */
  set(value: T): void {
    if (Object.is(value, this.#value)) return;
    this.#value = value;
    for (const reader of this.#readers) reader.mark(DIRTY);
    flush();
  }
}

/** A signal holding `value`. */
export function signal<T>(value: T): Signal<T> {
  return new Signal(value);
}

/** A value computed from signals, again only when it's read after a change; its readers run only when it changes. */
export class Computed<T> {
  readonly #read: () => T;
  readonly #readers = new Set<Reader>();
  readonly #reader = new Reader(() => {
    for (const reader of this.#readers) reader.mark(CHECK);
  });
  /** What `read` returned, or threw, the last time it ran. */
  #last: { value: T } | { error: unknown };

  constructor(read: () => T) {
    this.#read = read;
    // Made while HTML is built, it stops with that HTML, keeping its last value.
    building?.onDispose(() => this.#reader.stop());
    this.#last = this.#run();
  }

  /** The value now, read as a signal is. If `read` threw, this throws its error. */
  get(): T {
    if (this.#reader.stale()) {
      const last = this.#last;
      this.#last = this.#run();
      // An error always counts as a change.
      if (!("value" in last && "value" in this.#last && Object.is(last.value, this.#last.value))) {
        for (const reader of this.#readers) reader.mark(DIRTY);
      }
    }
    onRead(this, this.#readers);
    if ("error" in this.#last) throw this.#last.error;
    return this.#last.value;
  }

  #run(): { value: T } | { error: unknown } {
    try {
      return { value: this.#reader.track(this.#read) };
    } catch (error) {
      return { error };
    }
  }
}

/** A value computed by `read` from signals. */
export function computed<T>(read: () => T): Computed<T> {
  return new Computed(read);
}

/** What a component takes when it only reads a value that changes: a signal, or a computed value. */
export type ReadonlySignal<T> = Signal<T> | Computed<T>;

/** The watchers told to run, and how many batches, flushes and first runs are running: while one is, they wait. */
let queue: Watcher[] = [];
let batching = 0;

/** How many flushes have started, to count each watcher's runs in one. */
let flushes = 0;

/** The watcher whose run is under way, even inside `outside`: a scope made now is made by that run. */
let running: Watcher | undefined;

/** Runs a function again whenever something it read the last time changes, until it's stopped. */
class Watcher extends Reader {
  /** The scope it was made in, where an error from its run looks for a `catchError`. */
  readonly scope = building;
  readonly #run: () => void;
  #runs = 0;
  #flush = 0;

  constructor(run: () => void) {
    // Dirty, since it hasn't run yet.
    super(() => queue.push(this), DIRTY);
    this.#run = run;
  }

  /** Runs, if something it read has changed and it hasn't been stopped. */
  update(): void {
    if (!this.stale()) return;
    this.#runs = this.#flush === flushes ? this.#runs + 1 : 1;
    this.#flush = flushes;
    if (this.#runs > MAX_RUNS) throw new Error("wobbui: a watcher kept changing a signal it reads.");
    this.track(this.#run);
  }
}

/**
 * Runs the queued watchers, and what they queue, until none is left. Before each, the watchers whose runs made it run,
 * outermost first, if they're due: one may stop it, so it never runs on values that are about to remove it. An error
 * goes to a `catchError` around the watcher that threw it, or is rethrown once all have run.
 */
function flush(): void {
  if (batching > 0) return;
  batching++;
  flushes++;
  let failure: { error: unknown } | undefined;
  while (queue.length > 0) {
    const round = queue;
    queue = [];
    for (const watcher of round) {
      for (const due of [...makersOf(watcher), watcher]) {
        try {
          due.update();
        } catch (error) {
          if (!due.scope?.caught(error)) failure ??= { error };
        }
      }
    }
  }
  batching--;
  if (failure !== undefined) throw failure.error;
}

/** The watchers whose runs made `watcher`, through the scopes it's in, outermost first. */
function makersOf(watcher: Watcher): Watcher[] {
  const makers: Watcher[] = [];
  for (let scope = watcher.scope; scope !== undefined; scope = scope.parent) {
    if (scope.maker !== undefined && scope.maker !== makers[0]) makers.unshift(scope.maker);
  }
  return makers;
}

/**
 * Runs `run` and returns what it returns. Signals set inside change at once, but what read them runs once, after the
 * outermost batch. If `run` throws, that still runs, and `run`'s error is rethrown.
 */
export function batch<T>(run: () => T): T {
  batching++;
  let result: T;
  try {
    result = run();
  } catch (error) {
    rethrowAfter(error, () => {
      batching--;
      flush();
    });
  }
  batching--;
  flush();
  return result;
}

/**
 * Runs `run` now, and again whenever a signal it read changes. Returns `stop`; calling it, even from a cleanup, ends
 * the watch. Called while HTML is being built, it also stops when that HTML is removed. What a run starts, such as
 * another `watch` or an `onCleanup`, is stopped before the next run. A cleanup that throws doesn't stop the next run;
 * its error is rethrown after it.
 */
export function watch(run: () => void): () => void {
  const owner = building;
  let pass: Scope | undefined;
  let stopped = false;
  const endPass = () => {
    const ended = pass;
    pass = undefined;
    ended?.dispose();
  };
  const onStop = () => {
    stopped = true;
    endPass();
  };
  return bind(() => {
    // The run goes ahead even when ending the last one throws: it reads the signals that run it again, so skipping it
    // would leave the watch listening to nothing, never to run again. But a cleanup that called `stop` ended the watch,
    // and nothing would stop what a new run started.
    let failure: { error: unknown } | undefined;
    try {
      endPass();
    } catch (error) {
      failure = { error };
    }
    if (!stopped) {
      pass = owner === undefined ? new Scope() : owner.child();
      try {
        within(pass, run);
      } catch (error) {
        failure ??= { error };
      }
    }
    if (failure !== undefined) throw failure.error;
  }, onStop);
}

/**
 * Stands in for a reader inside `untracked`: the signals read there subscribe nothing, and the reads are on purpose.
 * Anything that runs a reader of its own inside, such as a computed value brought up to date, sets its own.
 */
const QUIET = new Reader(() => {});
QUIET.stop();

/**
 * Runs `read` without subscribing anything to the signals it reads. Reading a signal once on purpose while HTML is
 * built, such as to start a form from a saved value, goes in here, so it isn't warned about.
 */
export function untracked<T>(read: () => T): T {
  return track(QUIET, read);
}

/** Runs `run` as the page would, outside anything watched, building only for `scope`: for handlers and cleanups. */
function outside<T>(run: () => T, scope?: Scope): T {
  const outer = building;
  building = scope;
  try {
    return track(undefined, run);
  } finally {
    building = outer;
  }
}

/** Whether wobbui warns about likely mistakes. */
let warnings = false;

/** The signals already warned about, so a mistake in a list or in a part rebuilt every frame warns once. */
const warned = new WeakSet<ReadonlySignal<unknown>>();

/**
 * Turns wobbui's warnings on or off. They're off unless turned on, and wobbui's development build, which bundlers such
 * as Vite pick while developing, turns them on.
 */
export function setWarnings(on: boolean): void {
  warnings = on;
}

/** Warns, once per signal, that `source` was read while HTML was built, outside anything that would read it again. */
function warnOfRead(source: ReadonlySignal<unknown>): void {
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

/**
 * Starts a watcher for `run`, stopped with the HTML being built, if any. Returns `stop`, which also runs `onStop`;
 * once it's called, that HTML forgets it.
 */
function bind(run: () => void, onStop?: () => void): () => void {
  const watcher: Watcher = new Watcher(() => {
    // A scope made in this run is made by this watcher, whose next run may dispose it.
    const outer = running;
    running = watcher;
    try {
      run();
    } finally {
      running = outer;
    }
  });
  const owner = building;
  const stop = () => {
    owner?.forget(stop);
    watcher.stop();
    onStop?.();
  };
  owner?.onDispose(stop);
  try {
    // As a batch, so what the run changes runs after it, and never inside it. If anything in it throws, `stop` never
    // reaches the caller, so it's stopped here.
    batch(() => watcher.update());
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

/** Brands a scope as an `Owner`, which shows nothing else of it. */
declare const owned: unique symbol;

/**
 * Frees what was made while building a piece of HTML: its live spots, and the HTML a live spot built. A live spot's
 * HTML has a scope of its own, inside the one that built the spot, so rebuilding it frees only that part.
 */
class Scope {
  declare readonly [owned]: true;
  #cleanups: Set<() => void> | undefined = new Set();
  /** The scope it was made in, to find an error's handler, and the watchers that run before those inside it. */
  readonly parent: Scope | undefined;
  /** The watcher whose run made it, if one did: its next run may dispose it, so it runs first. */
  readonly maker = running;
  /** Takes an error thrown inside, for `catchError`. */
  onError: ((error: unknown) => void) | undefined;

  constructor(parent?: Scope) {
    this.parent = parent;
  }

  /** Runs `cleanup` when this scope is disposed, or now if it already was. */
  onDispose(cleanup: () => void): void {
    if (this.#cleanups === undefined) cleanup();
    else this.#cleanups.add(cleanup);
  }

  /** Lets go of `cleanup` without running it, once what it stops has stopped on its own. */
  forget(cleanup: () => void): void {
    this.#cleanups?.delete(cleanup);
  }

  /** A scope disposed with this one, unless it's disposed first. */
  child(): Scope {
    const child = new Scope(this);
    const dispose = () => child.dispose();
    this.onDispose(dispose);
    child.onDispose(() => this.forget(dispose));
    return child;
  }

  /** Hands `error` to the nearest handler not yet disposed, from this scope out. Returns whether there was one. */
  caught(error: unknown): boolean {
    if (this.onError === undefined || this.#cleanups === undefined) return this.parent?.caught(error) ?? false;
    this.onError(error);
    return true;
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

/** What `getOwner` returns: what was being built, for `runWithOwner`, showing nothing else. */
export type Owner = { readonly [owned]: true };

/** What's being built now, if anything, for `runWithOwner` to add to later, as from a click or after an `await`. */
export function getOwner(): Owner | undefined {
  return building;
}

/**
 * Runs `run` as part of `owner`, outside anything watched, and returns what it returns: what it makes goes with the
 * owner, at once if the owner has gone. An error that a `catchError` around the owner takes returns `undefined`.
 */
export function runWithOwner<T>(owner: Owner | undefined, run: () => T): T | undefined {
  // Every owner is a scope, since only `getOwner` makes one.
  const scope = owner as Scope | undefined;
  // As a batch, so only `run`'s own error goes to a `catchError`, and one from what it changed reaches the caller.
  return batch(() => {
    try {
      return outside(run, scope);
    } catch (error) {
      if (!scope?.caught(error)) throw error;
      return undefined;
    }
  });
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
  // Not `ReadonlySignal<Child>`, which TypeScript can't expand inside the type it defines.
  | Signal<Child>
  | Computed<Child>
  | (() => Child)
  | readonly Child[];

/** What a live spot shows: a plain value, a signal or a computed value, or a function that reads signals. */
export type Live<T> = T | ReadonlySignal<T> | (() => T);

/**
 * Builds the HTML `build` returns and adds it to `parent`. Returns `unmount`, which stops every live spot in the HTML
 * and then removes it. Called while other HTML is being built, it's also unmounted when that HTML is removed, so a
 * dialog can mount itself on `document.body` and still go with the component that opened it.
 */
export function mount(parent: Node, build: () => JSX.Element): () => void {
  const owner = building;
  // Errors inside find a handler around the owner, but the scope joins the owner only once its HTML is added, below.
  const scope = new Scope(owner);
  const unmount = () => {
    owner?.forget(unmount);
    scope.dispose();
  };
  // The HTML is whatever lies between two markers, so unmounting removes what's there then: an element that another
  // mount or a live spot has taken since stays where it went. Removing it is the scope's first cleanup, so it runs
  // last, once what the HTML started has stopped.
  const start = marker();
  const end = marker();
  scope.onDispose(() => remove(start, end));
  try {
    const html = within(scope, () => track(undefined, build));
    // The markers go in first, so a parent that refuses the HTML refuses it before it leaves wherever it was.
    parent.appendChild(start);
    parent.appendChild(end);
    parent.insertBefore(html, end);
  } catch (error) {
    rethrowAfter(error, unmount);
  }
  // Only once the HTML is on the page, so that if what's being built went while this was built, this removes it now.
  owner?.onDispose(unmount);
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

/** Removes `start`, `end` and the nodes between them. */
function remove(start: ChildNode, end: ChildNode): void {
  clear(start, end);
  start.remove();
  end.remove();
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

/**
 * The props that would put text on the page as HTML, in lowercase. The types refuse them too; this catches untyped
 * calls, whatever their case, since `srcDoc` would set the `srcdoc` attribute.
 */
const RAW_HTML = new Set(["innerhtml", "outerhtml", "srcdoc"]);

function setProperty(element: HTMLElement, name: string, value: unknown): void {
  if (RAW_HTML.has(name.toLowerCase())) {
    throw new Error(`wobbui: ${name} isn't a prop, since it would put text on the page as HTML. Set it in a ref.`);
  } else if (name.startsWith("on")) {
    // A handler can run while HTML is still being built, as when building focuses an input, so it runs as the page
    // would run it: subscribing nothing, and its reads not warned about. As a batch, what it changes updates once.
    (element as unknown as Record<string, unknown>)[name] =
      typeof value === "function"
        ? function (this: unknown, ...args: unknown[]) {
            return outside(() => batch(() => (value as (...args: unknown[]) => unknown).apply(this, args)));
          }
        : value;
  } else if (isLive(value)) {
    currentScope("A live value");
    bind(() => assign(element, name, latest(value)));
  } else {
    assign(element, name, value);
  }
}

/** The attribute a property reflects, where it isn't the property's name in lowercase or an ARIA property's. */
const ATTRIBUTE_OF = new Map([
  ["className", "class"],
  ["htmlFor", "for"],
  ["httpEquiv", "http-equiv"],
  ["acceptCharset", "accept-charset"],
  ["defaultChecked", "checked"],
  ["defaultSelected", "selected"],
  ["defaultMuted", "muted"],
]);

/** The attribute a property reflects, as `ariaLabel` reflects `aria-label`. */
function attributeOf(name: string): string {
  return ATTRIBUTE_OF.get(name) ?? (name.startsWith("aria") ? `aria-${name.slice(4).toLowerCase()}` : name);
}

/**
 * What a property goes back to when it's given `null` or `undefined`, where it holds what's entered or shown instead of
 * reflecting an attribute. `value` does so only on the elements in `ENTERED`; elsewhere, as on `<progress>` or
 * `<option>`, removing its attribute clears it. `defaultValue` is a textarea's text, so it's set, not removed.
 */
const EMPTY = new Map<string, unknown>([
  ["value", ""],
  ["defaultValue", ""],
  ["valueAsNumber", NaN],
  ["valueAsDate", null],
  ["checked", false],
  ["indeterminate", false],
  ["selected", false],
  ["selectedIndex", -1],
  ["textContent", ""],
  ["innerText", ""],
]);

/** The elements whose `value` holds what's entered or shown. */
const ENTERED = new Set(["INPUT", "OUTPUT", "SELECT", "TEXTAREA"]);

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
    if (EMPTY.has(name) && (name !== "value" || ENTERED.has(element.tagName))) properties[name] = EMPTY.get(name);
    else element.removeAttribute(attributeOf(name));
  } else {
    try {
      properties[name] = value;
    } catch {
      // A property that can only be read, such as an input's `list`: its attribute sets it.
      element.setAttribute(name, String(value));
    }
  }
}

function isLive<T>(value: Live<T>): value is ReadonlySignal<T> | (() => T) {
  return value instanceof Signal || value instanceof Computed || typeof value === "function";
}

/** A live value's value now. */
function latest<T>(live: ReadonlySignal<T> | (() => T)): T {
  return typeof live === "function" ? live() : live.get();
}

function append(parent: Node, child: Child): void {
  if (child === null || child === undefined || typeof child === "boolean") return;
  if (Array.isArray(child)) {
    for (const item of child as readonly Child[]) append(parent, item);
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
 * Whenever a signal the function read changes, what the run before started stops, its own live spots included, while
 * its HTML is still on the page; then the function runs again, as a `watch` does, and text changes in place, while
 * anything else is rebuilt: the old HTML is removed and the new added. A cleanup of the old HTML that throws doesn't
 * stop the new HTML from showing. If the function throws, the old HTML stays, stopped; if a function child it returns
 * throws on its first run, the spot shows nothing until the next change. Either way, what the failed HTML started
 * stops. A spot that stops leaves its HTML for whatever removes the HTML around it, so every cleanup inside runs while
 * all of it is on the page.
 */
function liveSpot(parent: Node, live: ReadonlySignal<unknown> | (() => unknown)): void {
  const owner = currentScope("A live value");
  const start = parent.appendChild(marker());
  const end = parent.appendChild(marker());
  let text: Text | undefined;
  let shown: Scope | undefined;
  bind(() => {
    // What the last run started stops first, while its HTML is still on the page. If a cleanup throws, the spot still
    // updates, and the error is rethrown once it has: the first error, ahead of any from this run.
    let failure: { error: unknown } | undefined;
    const ended = shown;
    shown = undefined;
    try {
      ended?.dispose();
    } catch (error) {
      failure = { error };
    }
    // What a function starts while it's read, HTML included, belongs to `next`, so the run after this one frees it.
    let next: Scope | undefined;
    let value: unknown;
    if (typeof live !== "function") {
      value = live.get();
    } else {
      next = owner.child();
      try {
        value = within(next, live);
      } catch (error) {
        rethrowAfter(failure === undefined ? error : failure.error, () => next?.dispose());
      }
    }
    // The rest reads no signal on purpose, so nothing it sets off, such as a custom element told it was removed,
    // subscribes the spot.
    outside(() => {
      // Text changes in place, unless the page has removed its node, as `normalize()` removes an empty one.
      if (text !== undefined && text.parentNode !== null && isText(value)) {
        shown = next;
        text.data = String(value);
      } else {
        // The old HTML goes before the new is added, so an element the function returns again stays on the page.
        clear(start, end);
        text = undefined;
        const scope = next ?? owner.child();
        shown = scope;
        const fragment = document.createDocumentFragment();
        try {
          within(scope, () => append(fragment, value as Child));
        } catch (error) {
          rethrowAfter(failure === undefined ? error : failure.error, () => scope.dispose());
        }
        text = isText(value) ? (fragment.firstChild as Text) : undefined;
        end.parentNode?.insertBefore(fragment, end);
      }
    });
    if (failure !== undefined) throw failure.error;
  });
}

function isText(value: unknown): value is string | number | bigint {
  return typeof value === "string" || typeof value === "number" || typeof value === "bigint";
}

/**
 * A part that shows `build`'s HTML while `when` is truthy, and `fallback`'s, if any, while it isn't. It rebuilds only
 * when `when` flips, since `build` reads signals as any HTML does: typing in an input inside doesn't rebuild it.
 */
export function show(when: Live<unknown>, build: () => Child, fallback?: () => Child): () => Child {
  const truthy = computed(() => Boolean(isLive(when) ? latest(when) : when));
  return () => {
    const make = truthy.get() ? build : fallback;
    return make && track(undefined, make);
  };
}

/** An item's HTML in a list from `each`: what lies between two markers, and what it started. */
type Row<T> = { item: T; scope: Scope; start: Comment; end: Comment };

/**
 * A list that keeps each item's HTML, built once by `render`, as the list changes: an item still there keeps its HTML,
 * moved into place, and a gone item's is removed after its cleanups. Items match by identity, repeated ones in order.
 */
export function each<T>(list: Live<readonly T[]>, render: (item: T) => Child): DocumentFragment {
  const owner = currentScope("A live value");
  const html = document.createDocumentFragment();
  // Where the list starts: the first row goes right after it, and each other row right after the one before.
  const start = html.appendChild(marker());
  let rows: Row<T>[] = [];
  bind(() => {
    const items = isLive(list) ? latest(list) : list;
    // The rest reads no signal on purpose, as in a live spot.
    outside(() => {
      // Each item's rows, last first, so `pop` takes them in the order they were shown.
      const old = new Map<T, Row<T>[]>();
      for (let index = rows.length - 1; index >= 0; index--) {
        const row = rows[index];
        if (row === undefined) continue;
        const same = old.get(row.item);
        if (same === undefined) old.set(row.item, [row]);
        else same.push(row);
      }
      const next: Row<T>[] = [];
      const built: Row<T>[] = [];
      try {
        // A hole in the list is the item `undefined`, as `for…of` reads it.
        for (const item of items) {
          const kept = old.get(item)?.pop();
          if (kept !== undefined) {
            next.push(kept);
            continue;
          }
          const row = { item, scope: owner.child(), start: marker(), end: marker() };
          built.push(row);
          within(row.scope, () => append(document.createDocumentFragment(), [row.start, render(item), row.end]));
          next.push(row);
        }
      } catch (error) {
        // No row is added or removed.
        rethrowAfter(error, () => forEach(built, (row) => row.scope.dispose()));
      }
      rows = next;
      // A gone row's cleanups run while it's on the page; if one throws, the list still updates before it's rethrown.
      const gone = [...old.values()].flat();
      try {
        forEach(gone, (row) => row.scope.dispose());
      } finally {
        for (const row of gone) remove(row.start, row.end);
        // One walk puts the rows in order: a row right after the one before it stays, and any other moves there.
        let previous: ChildNode = start;
        for (const row of rows) {
          if (previous.nextSibling !== row.start) {
            const nodes: ChildNode[] = [];
            for (let node: ChildNode | null = row.start; node !== null; node = node.nextSibling) {
              nodes.push(node);
              if (node === row.end) break;
            }
            previous.after(...nodes);
          }
          previous = row.end;
        }
      }
    });
  });
  return html;
}

/**
 * A part that shows `build`'s HTML until something in it throws, as it's built or updates, and then `fallback(error,
 * reset)` until `reset()` builds it again. The fallback's errors go to the next one out; event handlers' aren't caught.
 */
export function catchError(build: () => Child, fallback: (error: unknown, reset: () => void) => Child): () => Child {
  const failed = signal<{ error: unknown } | undefined>(undefined);
  const reset = () => failed.set(undefined);
  return () => {
    const failure = failed.get();
    if (failure !== undefined) return track(undefined, () => fallback(failure.error, reset));
    // Built in a scope of its own, live parts and all, so an error from inside finds this one.
    const scope = currentScope("catchError").child();
    scope.onError = (error) => failed.set({ error });
    const html = document.createDocumentFragment();
    try {
      within(scope, () => append(html, track(undefined, build)));
      return html;
    } catch (error) {
      // The part then runs again, which stops what this build started, and shows the fallback.
      failed.set({ error });
      return undefined;
    }
  };
}

// Types for JSX ------------------------------------------------------------------------------------------------------

type IfEquals<X, Y, Then, Else> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? Then : Else;

/**
 * The properties of `E` JSX can set: named ones only (a form's index signature would accept anything), not read-only,
 * not methods, not handlers, not `style`, which takes text, and not raw HTML, which would put text on the page as HTML.
 */
type Settable<E> = {
  [K in keyof E]-?: string extends K
    ? never
    : number extends K
      ? never
      : K extends `on${string}` | "style" | "innerHTML" | "outerHTML" | "srcdoc"
        ? never
        : E[K] extends (...args: never[]) => unknown
          ? never
          : IfEquals<{ [P in K]: E[K] }, { -readonly [P in K]: E[K] }, K, never>;
}[keyof E];

/** The elements whose `form` attribute names, by its `id`, the form they belong to. */
type FormControl = HTMLElementTagNameMap["button" | "fieldset" | "input" | "object" | "output" | "select" | "textarea"];

/**
 * The read-only properties JSX sets through the attribute they reflect: a form control's `form`, and an input's
 * `list`, which names the `<datalist>` of its suggestions by its `id`.
 */
type SetByAttribute<E> = (E extends FormControl ? "form" : never) | (E extends HTMLInputElement ? "list" : never);

/** The event an element's `on…` property hands its handler. */
type EventOf<Handler> = NonNullable<Handler> extends (this: never, event: infer E) => unknown ? E : Event;

/**
 * What JSX takes for an element `E`. A text property takes a number too, as in `min={0}`, and every property takes
 * `null` or `undefined`, which clear it.
 */
export type Props<E extends HTMLElement> = {
  [K in Settable<E>]?: Live<(E[K] extends string ? E[K] | number : E[K]) | null | undefined>;
} & {
  [K in SetByAttribute<E>]?: Live<string | null | undefined>;
} & {
  [K in keyof E as K extends `on${string}` ? K : never]?: (event: EventOf<E[K]> & { currentTarget: E }) => void;
} & {
  children?: Child;
  ref?: (element: E) => void;
  style?: Live<string | null | undefined>;
  [attribute: `data-${string}` | `aria-${string}`]: Live<string | number | boolean | null | undefined>;
};

export declare namespace JSX {
  type Element = Node;
  interface ElementChildrenAttribute {
    children: unknown;
  }
  type IntrinsicElements = { [K in keyof HTMLElementTagNameMap]: Props<HTMLElementTagNameMap[K]> };
}
