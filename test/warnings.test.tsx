import { host } from "./dom.js";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, mock, test, type Mock } from "node:test";
import { mount, onCleanup, setWarnings, signal, untracked, watch } from "wobbui";

let warn: Mock<typeof console.warn>;

beforeEach(() => {
  setWarnings(true);
  warn = mock.method(console, "warn", () => {});
});

afterEach(() => {
  setWarnings(false);
  mock.restoreAll();
});

test("reading a signal while building HTML, outside a function, warns that it won't update", () => {
  const volume = signal(5);
  mount(host(), () => <p>Volume: {volume.get()}</p>);
  assert.equal(warn.mock.callCount(), 1);
  assert.match(String(warn.mock.calls[0]?.arguments[0]), /won't update/);
});

test("a component's read while it builds is warned about too", () => {
  const volume = signal(5);
  function Meter(props: { volume: typeof volume }) {
    return <p>{props.volume.get()}</p>;
  }
  mount(host(), () => <Meter volume={volume} />);
  assert.equal(warn.mock.callCount(), 1);
});

test("the ways a value stays live, or is read on purpose, aren't warned about", () => {
  const volume = signal(5);
  const parent = host();
  mount(parent, () => {
    watch(() => volume.get());
    const start = signal(untracked(() => volume.get()));
    return (
      <div>
        <span>{volume}</span>
        <span>{() => volume.get() * 10}</span>
        <input value={volume} />
        <button onclick={() => volume.set(volume.get() + 1)}>Louder</button>
        <span>{start}</span>
      </div>
    );
  });
  parent.querySelector("button")?.click();
  volume.get();
  assert.equal(warn.mock.callCount(), 0);
});

test("a handler or a cleanup that runs while HTML is still being built isn't warned about", () => {
  const draft = signal("hello");
  const saved: string[] = [];
  mount(host(), () => {
    const button = (<button onclick={() => saved.push(draft.get())}>Save</button>) as HTMLButtonElement;
    button.click();
    const unmountNote = mount(host(), () => {
      onCleanup(() => saved.push(draft.get()));
      return <p>Note</p>;
    });
    unmountNote();
    return button;
  });
  assert.deepEqual(saved, ["hello", "hello"]);
  assert.equal(warn.mock.callCount(), 0);
});

test("a set inside untracked still warns about a mistake in what it rebuilds", () => {
  const visits = signal(0);
  const theme = signal("light");
  function Badge() {
    return <b>{theme.get()}</b>;
  }
  mount(host(), () => <section>{() => visits.get() > 0 && <Badge />}</section>);
  mount(host(), () => {
    untracked(() => visits.set(visits.get() + 1));
    return <p>Visited</p>;
  });
  assert.equal(warn.mock.callCount(), 1, "Badge, rebuilt by the set, read the theme once");
});

test("each signal is warned about once, however often it's misread", () => {
  const theme = signal("light");
  mount(host(), () => (
    <ul>
      {[1, 2, 3].map(() => (
        <li>{theme.get()}</li>
      ))}
    </ul>
  ));
  assert.equal(warn.mock.callCount(), 1);
});

test("warnings are off until turned on", () => {
  setWarnings(false);
  const volume = signal(5);
  mount(host(), () => <p>{volume.get()}</p>);
  assert.equal(warn.mock.callCount(), 0);
});

test("the development build, which bundlers pick while developing, has warnings on", () => {
  // A separate Node process, so the package resolves through its export conditions as a bundler's would.
  const script = `
    import { Window } from "happy-dom";
    const browser = new Window();
    const { document, Node, DocumentFragment } = browser;
    Object.assign(globalThis, { document, Node, DocumentFragment });
    const { mount, signal } = await import("wobbui");
    const { jsx } = await import("wobbui/jsx-runtime");
    let warned = 0;
    console.warn = () => warned++;
    const volume = signal(5);
    mount(document.createElement("div"), () => jsx("p", { children: volume.get() }));
    process.stdout.write(String(warned));
  `;
  const run = (conditions: string[]) =>
    execFileSync(process.execPath, [...conditions, "--input-type=module", "--eval", script], { encoding: "utf8" });
  assert.equal(run(["--conditions=development"]), "1");
  assert.equal(run([]), "0");
});
