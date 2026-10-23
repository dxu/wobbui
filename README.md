# wobbui

A tiny library for building HTML with JSX. It builds real elements once and updates only what changes: HTML that
doesn't change costs nothing after it's built, and a number that changes every frame touches one text node.

- **JSX builds real elements.** `<main className="p-8">` is an `HTMLElement`. There's no virtual DOM, and nothing
  re-renders.
- **A signal holds a value that changes.** Pass a signal, or a function that reads signals, where a property or a child
  goes, and that one spot updates when the value changes.
- **`mount` returns `unmount`,** which stops everything live in the HTML, including whatever was started while it was
  built, and then removes it.

It is one small file with no dependencies: about 3.4 KB compressed, less when an app uses only some of it.

```sh
npm install wobbui
```

Then tell TypeScript where JSX comes from. Vite reads the same setting, so it needs no plugin:

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "wobbui",
    "moduleResolution": "bundler" // or "nodenext": the older "node" can't find wobbui/jsx-runtime
  }
}
```

## Why

Most UI libraries re-render: when state changes, they run your components again and work out what to change on the
page. That's convenient, but it takes a lot of code (React and React DOM come to about 69 KB compressed) and work on
every change. wobbui builds each element once, as you would by hand, and wires each value that changes straight to the
place it's shown. It's the idea behind VanJS and Solid, written as JSX, with no compiler of its own.

## Elements

```tsx
import { mount } from "wobbui";

const unmount = mount(document.body, () => (
  <main className="p-8">
    <h1>Settings</h1>
    <label htmlFor="name">Name</label>
    <input id="name" placeholder="Your name" />
    <button onclick={() => console.log("saved")}>Save</button>
  </main>
));
```

- **Properties are the element's own DOM properties,** by their DOM names: `className`, `htmlFor`, `value`, `disabled`,
  and lowercase event handlers such as `onclick` and `oninput`. Their types come from TypeScript's DOM types, so a
  misspelled property or a value of the wrong type is a type error. A text property takes a number too: `min={0}`.
- **A name with a dash is an attribute,** such as `data-id` or `aria-label`. It writes `true` and `false` out, as
  `aria-expanded={open}` needs.
- **`null` or `undefined` clears a property,** so an optional prop passed straight through leaves nothing behind. The
  attribute it reflects is removed, so a progress bar's `value` goes back to showing it's still loading, and an
  option's `value` to its text. The properties that hold what's entered or shown go back to empty instead: `value` on
  an input, select, textarea or output, and `defaultValue`, `valueAsNumber`, `valueAsDate`, `checked`, `indeterminate`,
  `selected`, `selectedIndex`, `textContent` and `innerText`. A property that does neither, such as `volume` or
  `scrollTop`, keeps its value.
- **`style` takes text:** `style="width: 8rem"`.
- **`ref` gets the element** once it's built, children and all, before it's on the page:
  `<canvas ref={(canvas) => (context = canvas.getContext("2d"))} />`. To focus an input, keep it this way and call
  `focus()` after `mount`.
- **Raw HTML isn't a prop** (`innerHTML`, `outerHTML` or an iframe's `srcdoc`): it's a type error, and an error when
  it's run without types. When you must, a `ref` can set it, never with text you don't control.
- **An input's value is set last,** after its other properties and its children, so a select already has its options
  and a range input its `min` and `max`.

## Signals

```tsx
import { mount, signal } from "wobbui";

const volume = signal(5);

mount(document.body, () => (
  <label>
    Volume
    <input
      type="range"
      min={0}
      max={10}
      value={volume}
      oninput={(event) => volume.set(event.currentTarget.valueAsNumber)}
    />
    <span>{volume}</span>
  </label>
));

volume.set(8); // the slider and the number both show 8
```

A spot is live when you pass the signal itself, or a function that reads signals:

```tsx
<span>{volume}</span>                     // updates
<span>{() => volume.get() * 10}%</span>   // updates
<span>{volume.get()}</span>               // read once, never updates
```

That last line is the one rule to remember: everything else is built once and never looked at again. While you
develop, wobbui warns about it: a signal read while HTML is built, outside a function, logs a warning in the console
that points at the line. Read once on purpose, such as to start a form from a saved value, inside `untracked`:
`signal(untracked(() => saved.get()))`. Bundlers such as Vite pick wobbui's development build while developing, which
has the warnings on; a production build leaves them off. `setWarnings(true)` turns them on anywhere else.

A function child can return HTML. When a signal it read changes, the live spots inside the HTML it showed stop, the
function runs again and builds new HTML, and the new HTML takes the old one's place:

```tsx
const open = signal(false);

mount(document.body, () => (
  <section>
    <button onclick={() => open.set(!open.get())}>Details</button>
    {() => open.get() && <p>More about this setting.</p>}
  </section>
));
```

Build the HTML inside the function, as here. An element built outside it, such as in the component around it, can be
shown again, by the same function or another, on its own or inside new HTML. Its live parts belong to what built it,
so they keep updating as long as that's shown. A fragment (`<>…</>`) built outside empties the first time it's added,
so it shows only once.

A function child rebuilds whenever anything it read changes, even when it would build the same HTML again.
`show(when, build, fallback)` rebuilds only when `when` turns from true to false or back, so the HTML inside, an input
the user is typing in included, stays while the rest changes:

```tsx
import { show } from "wobbui";

<section>
  {show(() => results.get().length > 0, () => <ResultList results={results} />, () => <p>No results.</p>)}
</section>
```

`when` is a value, a signal, or a function that reads signals; the fallback is optional. What `build` and the fallback
read, they read as any HTML does: once, unless it's in a live spot.

Each live spot (a signal or a function given as a child) and each mount marks where its HTML starts and ends with an
empty comment, `<!---->`. Removing that HTML removes whatever lies between the two, so an element that has moved
elsewhere since stays where it went. Change what a live spot shows through its signal, not by moving its elements by
hand: one moved outside its markers stays behind when the spot rebuilds, and anything put between them goes with it.

A list works the same way: `{() => names.get().map((name) => <li>{name}</li>)}` builds the list again whenever `names`
changes, which suits short lists. `each(list, render)` keeps each item's HTML instead, built once by `render`:

```tsx
import { each } from "wobbui";

<ul>{each(todos, (todo) => <li>{todo.title}</li>)}</ul>
```

When the list changes, an item still in it keeps its elements and live parts, moved to its new place; a new item's
HTML is built; and a gone item's HTML is removed, once its cleanups have run. Items are told apart by identity, so set
the list to the same objects again, not copies of them. An item that's in the list twice gets its HTML twice. An item
that moves toward the front is moved alone, but one that moves toward the end stays and the items it passes move
instead, which costs more only in long lists.

`watch(run)` runs `run` now, and again whenever a signal it read changes, for anything that isn't HTML:

```ts
const stop = watch(() => {
  audio.volume = volume.get() / 10;
});
```

`computed(read)` is a value computed from signals. It runs `read` again only when it's read after something `read` read
has changed, and what reads it runs again only when its value changes:

```tsx
import { computed } from "wobbui";

const even = computed(() => count.get() % 2 === 0);

<span>{() => (even.get() ? "Even" : "Odd")}</span> // runs again only when `even` changes
```

A computed value is read like a signal: pass it where a property or a child goes, or read it with `get()`. If `read`
throws, `get()` throws its error until something `read` read changes. One made while HTML is built stops with it.

Several changes update the page once inside `batch`:

```ts
import { batch } from "wobbui";

batch(() => {
  first.set("Grace");
  last.set("Hopper");
}); // what reads either name runs once, here
```

Inside, a signal changes at once, so a read sees the new value, and a computed value is up to date; what reads them runs
once `batch` returns. An event handler set with JSX, such as `onclick`, runs as a batch. A change made while a part
updates, or in `watch`, runs what it affects after that run, never in the middle of it; and a part runs before the
parts inside it, so one that's about to be removed never runs on the values that remove it.

## Components

A component is a function that takes props and returns HTML. It runs once:

```tsx
import { type Signal } from "wobbui";

function Slider(props: { label: string; value: Signal<number>; max: number }) {
  return (
    <label className="flex gap-2">
      {props.label}
      <input
        type="range"
        min={0}
        max={props.max}
        value={props.value}
        oninput={(event) => props.value.set(event.currentTarget.valueAsNumber)}
      />
    </label>
  );
}

mount(document.body, () => <Slider label="Volume" value={volume} max={10} />);
```

## Lifetimes

`mount` returns `unmount`, which stops every live spot in the HTML and then removes it. What wobbui started while the
HTML was built goes with it: a `watch` started in a component stops, and a `mount` started in a component, such as a
dialog mounted on `document.body`, is unmounted. For what wobbui doesn't know about, such as a timer or a listener on
`window`, `onCleanup` runs a function when the HTML goes:

```tsx
import { onCleanup, signal } from "wobbui";

function Clock() {
  const now = signal(new Date().toLocaleTimeString());
  const timer = setInterval(() => now.set(new Date().toLocaleTimeString()), 1000);
  onCleanup(() => clearInterval(timer));
  return <p>{now}</p>;
}
```

A part that rebuilds is cleaned up the same way before each rebuild, and so is a `watch` before each of its runs:
another `watch` or an `onCleanup` started in a run is stopped before the next run starts. Cleanups run while their
HTML, live parts and all, is still on the page, and then it's removed, so a cleanup can still read it, such as to save
how far it was scrolled.

When something throws, wobbui keeps going. A cleanup that throws as old HTML goes doesn't stop the new HTML from
showing, and a `watch` whose cleanup throws still runs. If a part's function throws, the part keeps the HTML it
showed, though what that HTML started has stopped; if a function child it returns throws on its first run, the part
shows nothing until its signal changes again.
Either way, what the failed HTML started stops, and the error reaches the code that changed the signal, as `set` says.

To show something else instead, wrap the HTML in `catchError`. An error inside, as it's built or as a part of it
updates, shows the fallback, and `reset` builds the HTML again:

```tsx
import { catchError } from "wobbui";

<main>
  {catchError(
    () => <Lab />,
    (error, reset) => (
      <p>
        The lab broke: {String(error)} <button onclick={reset}>Try again</button>
      </p>
    ),
  )}
</main>
```

What the failed HTML started stops while it's still on the page, and then it's removed. An error in the fallback goes
to the `catchError` around it. An event handler's error isn't caught: it reaches the browser, as one thrown there
always does.

A dialog opened from a click, or after an `await`, is built after its page, so it wouldn't go with the page.
`getOwner()` keeps what's being built, and `runWithOwner` builds for it later:

```tsx
import { getOwner, mount, runWithOwner } from "wobbui";

function Settings() {
  const owner = getOwner();
  async function save() {
    await saveSettings();
    runWithOwner(owner, () => mount(document.body, () => <dialog open>Saved</dialog>));
  }
  return <button onclick={save}>Save</button>;
}
```

The dialog is unmounted with the page, and an error as it's built or updates reaches the page's `catchError`.

Outside of building, `watch` and `mount` hand you `stop` and `unmount` to call yourself. A live value outside any
`mount` or `watch` is an error, since nothing would ever stop it. With [wobbree](https://github.com/dxu/wobbree), tie
the HTML to an owner: `owner.onDispose(mount(parent, () => <Menu />))`.

## Suggested standards

wobbui doesn't enforce these, but they keep pages easy to follow.

- **What's fixed is a plain value; what changes is a signal.** A component's props say which is which: `label: string`
  is set once, `value: Signal<number>` changes while it's shown.
- **Pass signals down, not their values,** so the component's spots stay live.
- **Keep inputs out of parts that rebuild.** A function child that rebuilds makes new inputs, and the user loses their
  place in them; give an input a signal for its value instead, and show it with `show` or `each`.
- **One component per file, named after it,** as `Slider.tsx` holds `Slider`, with helpers only it uses kept in it.
- **An app's data goes in files ending in `.data.ts`,** such as a menu's entries or a form's fields: values only, each
  checked against its type with `satisfies`, with no functions or components, so the ending tells data apart from code.
  The types they're checked against live with the code that reads them.

## API

### `signal(value)`

Returns a `Signal<T>`:

| Member | What it does |
| --- | --- |
| `get()` | The value now. Read in a live spot, in `watch` or in a computed value, it also subscribes that to changes. |
| `set(value)` | Changes the value. If the new one is different (by `Object.is`), everything that read it runs again before `set` returns; inside a batch, an event handler, or a run of a part or `watch`, once that's done. If one of them throws, the rest still run, and the first error is rethrown, unless a `catchError` takes it. |

### `computed(read)`

Returns a `Computed<T>`, a value computed by `read` from signals. `read` runs when it's made, and again only when the
value is read after something `read` read has changed; what reads it runs again only when its value changes (by
`Object.is`). Its `get()` reads it as a signal's does. If `read` throws, `get()` throws the error, until something
`read` read changes. Made while HTML is built, or in a run of `watch`, it stops with it, keeping its last value.

### `batch(run)`

Runs `run` and returns what it returns. A signal set inside changes at once, and a computed value read inside is up to
date, but what reads them runs once, after `run`. Batches nest: the outermost runs it. If `run` throws, what it changed
still runs, and `run`'s error is rethrown. Event handlers set with JSX run as a batch.

### `watch(run)`

Runs `run` now, and again whenever a signal it read the last time changes. Returns `stop`; calling it, even from a
cleanup, ends the watch. Started while HTML is built, it also stops when that HTML is removed. What a run starts, such
as another `watch` or an `onCleanup`, is stopped before the next run; a cleanup that throws doesn't stop the next run,
and its error is rethrown after it. A run that changes a signal it read runs once more afterwards, even if it threw, so
the last run sees the settled value; one that keeps changing it stops with an error after 100 runs. If `watch` itself
throws, from its first run or from what that run set off, the watch is stopped, since `stop` never reached you.

### `onCleanup(cleanup)`

Runs `cleanup` when what's being built now goes away: when its HTML is unmounted or rebuilt, or when the `watch` it's
called in runs again or stops. It only works inside `mount` or `watch`.

### `untracked(read)`

Runs `read` and returns what it returns, without subscribing anything to the signals it reads. A read inside it is on
purpose, so it isn't warned about.

### `setWarnings(on)`

Turns the warnings on or off. They're off, except in wobbui's development build, which bundlers pick while developing
through the `development` export condition.

### `mount(parent, build)`

Builds the HTML `build` returns and adds it to `parent`. Returns `unmount`, which stops everything live in it and then
removes it; running it again does nothing. An element another mount or a live spot has taken since stays where it
went, but the live spots this mount built inside it stop, keeping what they showed. Started while other HTML is built,
it's also unmounted with that HTML. If `build` or adding the HTML throws, nothing is added, and whatever it started
stops.

### `show(when, build, fallback?)`

Returns a function child that shows the HTML `build` returns while `when`, a value, a signal or a function that reads
signals, is truthy, and what `fallback` returns, if given, while it isn't. It rebuilds only when `when` turns from one
to the other. `build` and `fallback` read signals as any HTML does: once, unless in a live spot.

### `each(list, render)`

Shows the HTML `render(item)` returns for each item of `list`, a list, a signal or a function that reads signals, and
keeps it as the list changes: an item still there keeps its HTML, moved to its new place; a new item's HTML is built;
and a gone item's HTML is removed, once its cleanups have run. Items are told apart by identity, and an item that's in
the list twice gets its HTML twice. If `render` throws, no item's HTML is added or removed, and the error is rethrown;
if a gone item's cleanup throws, the list still updates, and then the error is rethrown. It only works while HTML is
built.

### `catchError(build, fallback)`

Returns a function child that shows the HTML `build` returns until something in it throws, as it's built or as a part
of it updates; then `fallback(error, reset)`'s, until `reset()` builds `build`'s HTML again. What the failed HTML
started stops. An error in the fallback goes to the `catchError` around it; an event handler's isn't caught.

### `getOwner()` and `runWithOwner(owner, run)`

`getOwner()` returns what's being built now, as an `Owner`, or `undefined`. `runWithOwner(owner, run)` runs `run` as
part of it, outside anything watched, and returns what `run` returns: a `mount`, `watch`, `computed` or `onCleanup`
inside goes with the owner, or stops at once if the owner has gone. If `run` throws and a `catchError` around the owner
takes the error, it returns `undefined`; otherwise the error is thrown.

### Types

`Signal<T>`; `Computed<T>`; `ReadonlySignal<T>`, a signal or a computed value, for what only reads it; `Live<T>`, a
value, a signal, a computed value or a function that reads signals; `Child`, anything JSX accepts as a child; `Owner`,
what `getOwner` returns; `Props<E>`, what JSX takes for an element `E`; and the `JSX` namespace.

## Performance

Measured on 18 October 2026, on wobbui 0.1.0, in headless Chrome 154 on an Apple M1 Max, while other work kept the
machine busy: the same small menu (a heading, three links, a slider showing its value, and a number that changes every
frame) built with each library and bundled minified. Medians of 12 page loads and 4 runs of 3 seconds each. Since then,
fixes and the functions from `computed` to `runWithOwner` have added 1.50 KB to wobbui's own compressed size; the
timings weren't measured again.

| | Compressed | Menu built, CPU slowed 4x | Script per frame, a number changing every frame |
| --- | --- | --- | --- |
| **wobbui** | **2.2 KB** | **10.9 ms** | **0.048 ms** |
| Plain DOM, written by hand | 0.6 KB | 8.8 ms | 0.039 ms |
| VanJS 1.6 | 1.6 KB | 9.8 ms | 0.073 ms |
| lit-html 3.3 | 3.6 KB | 16.7 ms | 0.047 ms |
| Solid 1.9 | 6.1 KB | 14.2 ms | 0.054 ms |
| Preact 11 | 6.1 KB | 13.9 ms | 0.102 ms |
| React 19.3 | 69.5 KB | 69.5 ms | 0.166 ms |

Sizes are whole bundles, the menu's own code included. A frame lasts 16.7 ms at 60 frames a second. HTML that isn't
changing runs no script at all: every library measured 0 ms a second.

## Design

- One file, [`src/index.ts`](src/index.ts), short enough to read in one sitting.
  [`src/jsx-runtime.ts`](src/jsx-runtime.ts) only re-exports what the JSX compiler imports, and
  [`src/development.ts`](src/development.ts), the development build, only turns the warnings on.
- No compiler of its own: TypeScript's or Vite's JSX transform calls `jsx()`, which makes the element there and then.
- Updates are synchronous: outside a batch, `set` returns once everything that read the signal has run. Each runs
  once per update, unless its own run changes what it read; a part runs before the parts inside it; and nothing runs
  on a mix of old and new values, as in Solid.
- The names and types are the DOM's own, so what you know about the DOM applies, and TypeScript checks every property.

## Not yet

- SVG elements.

## Development

Node 24 or later. `npm install`, then `npm run check` runs the type check, the linter (Oxlint) and the tests, which
build the package and run against it in happy-dom, a browser written in JavaScript. A test run that takes over a minute,
or that you stop, is ended along with every process in its process group, which is every one it started unless one
detaches itself; `node .test/run.js <files>` runs only those files.

## License

[MIT](LICENSE)
