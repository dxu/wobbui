# wobbui

A tiny library for building HTML with JSX. It builds real elements once and updates only what changes: HTML that
doesn't change costs nothing after it's built, and a number that changes every frame touches one text node.

- **JSX builds real elements.** `<main className="p-8">` is an `HTMLElement`. There's no virtual DOM, and nothing
  re-renders.
- **A signal holds a value that changes.** Pass a signal, or a function that reads signals, where a property or a child
  goes, and that one spot updates when the value changes.
- **`mount` returns `unmount`,** which removes the HTML and stops everything live in it, including whatever was started
  while it was built.

It is one small file with no dependencies: about 1.9 KB compressed.

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
- **`null` or `undefined` clears a property,** so an optional prop passed straight through leaves nothing behind.
- **`style` takes text:** `style="width: 8rem"`.
- **`ref` gets the element** once it's built, children and all, before it's on the page:
  `<canvas ref={(canvas) => (context = canvas.getContext("2d"))} />`. To focus an input, keep it this way and call
  `focus()` after `mount`.
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

A function child can return HTML. When a signal it read changes, the HTML it showed is removed, the live spots inside
it stop, and it's built again:

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

Each function child and each mount marks where its HTML starts and ends with an empty comment, `<!---->`. Removing
that HTML removes whatever lies between the two, so an element that has moved elsewhere since stays where it went.

A list works the same way: `{() => names.get().map((name) => <li>{name}</li>)}` builds the list again whenever `names`
changes, which suits short lists.

`watch(run)` runs `run` now, and again whenever a signal it read changes, for anything that isn't HTML:

```ts
const stop = watch(() => {
  audio.volume = volume.get() / 10;
});
```

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

`mount` returns `unmount`, which removes the HTML and stops every live spot in it. What wobbui started while the HTML
was built goes with it: a `watch` started in a component stops, and a `mount` started in a component, such as a dialog
mounted on `document.body`, is unmounted. For what wobbui doesn't know about, such as a timer or a listener on
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

A part that rebuilds is cleaned up the same way each time it's rebuilt, and so is a `watch` before each of its runs:
another `watch` or an `onCleanup` started in a run is stopped before the next.

When something throws, wobbui keeps going. A cleanup that throws as old HTML goes doesn't stop the new HTML from
showing, and a `watch` whose cleanup throws still runs. If a part's function throws, the part keeps the HTML it
showed; if a function child it returns throws on its first run, the part shows nothing until its signal changes again.
Either way, what the failed HTML started stops, and the error reaches the code that changed the signal, as `set` says.

Outside of building, `watch` and `mount` hand you `stop` and `unmount` to call yourself. A live value outside any
`mount` or `watch` is an error, since nothing would ever stop it. With [wobbree](https://github.com/dxu/wobbree), tie
the HTML to an owner: `owner.onDispose(mount(parent, () => <Menu />))`.

## Suggested standards

wobbui doesn't enforce these, but they keep pages easy to follow.

- **What's fixed is a plain value; what changes is a signal.** A component's props say which is which: `label: string`
  is set once, `value: Signal<number>` changes while it's shown.
- **Pass signals down, not their values,** so the component's spots stay live.
- **Keep inputs out of parts that rebuild.** A function child that rebuilds makes new inputs, and the user loses their
  place in them; give an input a signal for its value instead.
- **One component per file, named after it,** as `Slider.tsx` holds `Slider`, with helpers only it uses kept in it.

## API

### `signal(value)`

Returns a `Signal<T>`:

| Member | What it does |
| --- | --- |
| `get()` | The value now. Read in a live spot or in `watch`, it also subscribes that spot to changes. |
| `set(value)` | Changes the value. If the new one is different (by `Object.is`), everything that read it runs again before `set` returns. If one of them throws, the rest still run, and the first error is rethrown. |

### `watch(run)`

Runs `run` now, and again whenever a signal it read the last time changes. Returns `stop`. Started while HTML is built,
it also stops when that HTML is removed. What a run starts, such as another `watch` or an `onCleanup`, is stopped before
the next run; a cleanup that throws doesn't stop the next run, and its error is rethrown after it. A run that changes a
signal it read runs once more afterwards, even if it threw, so the last run sees the settled value; one that keeps
changing it stops with an error after 100 runs. If the first run throws, the watch is stopped.

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

Builds the HTML `build` returns and adds it to `parent`. Returns `unmount`, which removes it and stops everything live
in it; running it again does nothing. An element another mount or a function child has taken since stays where it
went, though its live parts stop with the rest. Started while other HTML is built, it's also unmounted with that HTML.
If `build` or adding the HTML throws, nothing is added, and whatever it started stops.

### Types

`Signal<T>`; `Live<T>`, a value, a signal or a function that reads signals; `Child`, anything JSX accepts as a child;
`Props<E>`, what JSX takes for an element `E`; and the `JSX` namespace.

## Performance

Measured on 18 October 2026, on wobbui 0.1.0, in headless Chrome 154 on an Apple M1 Max, while other work kept the
machine busy: the same small menu (a heading, three links, a slider showing its value, and a number that changes every
frame) built with each library and bundled minified. Medians of 12 page loads and 4 runs of 3 seconds each. Since then,
0.2.0's fixes have added 0.14 KB to wobbui's own compressed size; the timings weren't measured again.

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
- Updates are synchronous: `set` returns once everything that read the signal has run.
- The names and types are the DOM's own, so what you know about the DOM applies, and TypeScript checks every property.

## Not yet

- SVG elements.
- Keyed lists, which keep each item's elements when the list changes.
- Batching several `set` calls into one update.

## Development

Node 24 or later. `npm install`, then `npm run check` runs the type check, the linter (Oxlint) and the tests, which
build the package and run against it in happy-dom, a browser written in JavaScript.

## License

[MIT](LICENSE)
