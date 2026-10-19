# wobbui

A tiny library for building HTML with JSX. It builds real elements once and updates only what changes: HTML that
doesn't change costs nothing after it's built, and a number that changes every frame touches one text node.

- **JSX builds real elements.** `<main className="p-8">` is an `HTMLElement`. There's no virtual DOM, and nothing
  re-renders.
- **A signal holds a value that changes.** Pass a signal, or a function that reads signals, where a property or a child
  goes, and that one spot updates when the value changes.
- **`mount` returns `unmount`,** which removes the HTML and stops everything live in it, including whatever was started
  while it was built.

It is one small file with no dependencies: about 1.3 KB compressed.

```sh
npm install wobbui
```

Then tell TypeScript where JSX comes from. Vite reads the same setting, so it needs no plugin:

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "wobbui"
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
- **A name with a dash is an attribute,** such as `data-id` or `aria-label`.
- **`style` takes text:** `style="width: 8rem"`.
- **`ref` gets the element** once it's built, children and all: `<input ref={(input) => input.focus()} />`.
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

That last line is the one rule to remember: everything else is built once and never looked at again.

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

`mount` returns `unmount`, which removes the HTML and stops every live spot in it. Whatever was started while the HTML
was built goes with it: a `watch` started in a component stops, and a `mount` started in a component, such as a dialog
mounted on `document.body`, is unmounted.

```tsx
function SaveButton() {
  const saved = signal(false);
  mount(document.body, () => <p className="fixed bottom-4">{() => (saved.get() ? "Saved" : "")}</p>);
  return <button onclick={() => saved.set(true)}>Save</button>;
}
```

Outside of building, `watch` and `mount` hand you `stop` and `unmount` to call yourself. A live value outside any
`mount` is an error, since nothing would ever stop it. With [wobbree](https://github.com/dxu/wobbree), tie the HTML to
an owner: `owner.onDispose(mount(parent, () => <Menu />))`.

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
| `set(value)` | Changes the value. If the new one is different (by `Object.is`), everything that read it runs again before `set` returns. |

### `watch(run)`

Runs `run` now, and again whenever a signal it read the last time changes. Returns `stop`. Started while HTML is built,
it also stops when that HTML is removed.

### `untracked(read)`

Runs `read` and returns what it returns, without subscribing anything to the signals it reads.

### `mount(parent, build)`

Builds the HTML `build` returns and adds it to `parent`. Returns `unmount`, which removes it and stops everything live
in it; running it again does nothing. Started while other HTML is built, it's also unmounted with that HTML. If `build`
throws, nothing is added, and whatever it started stops.

### Types

`Signal<T>`; `Live<T>`, a value, a signal or a function that reads signals; `Child`, anything JSX accepts as a child;
`Props<E>`, what JSX takes for an element `E`; and the `JSX` namespace.

## Performance

Measured on 18 October 2026 in headless Chrome 154 on an Apple M1 Max, while other work kept the machine busy: the same
small menu (a heading, three links, a slider showing its value, and a number that changes every frame) built with each
library and bundled minified. Medians of 12 page loads and 4 runs of 3 seconds each.

| | Compressed | Menu built, CPU slowed 4x | Script per frame, a number changing every frame |
| --- | --- | --- | --- |
| **wobbui** | **1.7 KB** | **8.3 ms** | **0.046 ms** |
| Plain DOM, written by hand | 0.6 KB | 6.1 ms | 0.040 ms |
| VanJS 1.6 | 1.6 KB | 8.7 ms | 0.075 ms |
| lit-html 3.3 | 3.6 KB | 12.8 ms | 0.052 ms |
| Solid 1.9 | 6.1 KB | 11.1 ms | 0.060 ms |
| Preact 11 | 6.1 KB | 12.0 ms | 0.106 ms |
| React 19.3 | 69.5 KB | 55.7 ms | 0.167 ms |

Sizes are whole bundles, the menu's own code included. A frame lasts 16.7 ms at 60 frames a second. HTML that isn't
changing runs no script at all: every library measured 0 ms a second.

## Design

- One file, [`src/index.ts`](src/index.ts), short enough to read in one sitting.
  [`src/jsx-runtime.ts`](src/jsx-runtime.ts) only re-exports what the JSX compiler imports.
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
