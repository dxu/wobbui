import { host } from "./dom.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mount, signal, type Signal } from "wobbui";

test("a signal child changes its text in place", () => {
  const parent = host();
  const count = signal(1);
  mount(parent, () => <p>Count: {count}</p>);
  const paragraph = parent.querySelector("p");
  assert.ok(paragraph);
  const text = paragraph.childNodes[1];
  count.set(2);
  assert.equal(paragraph.textContent, "Count: 2");
  // Compared with ===: a failed assert.equal would print the whole simulated browser.
  assert.ok(paragraph.childNodes[1] === text, "the same text node shows the new count");
});

test("a function child rebuilds when what it read changes, and stops the HTML it replaced", () => {
  const parent = host();
  const open = signal(true);
  const label = signal("Volume");
  let builds = 0;
  mount(parent, () => (
    <section>
      {() => {
        builds++;
        return open.get() ? <b>{label}</b> : "Closed";
      }}
    </section>
  ));
  label.set("Loudness");
  assert.equal(parent.textContent, "Loudness");
  assert.equal(builds, 1, "a change inside the <b> updates only its own text");
  open.set(false);
  assert.equal(parent.textContent, "Closed");
  assert.equal(builds, 2);
  label.set("Gone");
  assert.equal(parent.textContent, "Closed");
  assert.equal(builds, 2, "the <b> it replaced no longer listens");
});

test("a live property updates", () => {
  const parent = host();
  const volume = signal(3);
  const busy = signal(false);
  mount(parent, () => <input type="range" min={0} max={10} value={volume} disabled={busy} />);
  const input = parent.querySelector("input");
  assert.ok(input);
  volume.set(7);
  busy.set(true);
  assert.equal(input.value, "7");
  assert.equal(input.disabled, true);
});

test("a function that computes a property updates when what it read changes", () => {
  const parent = host();
  const selected = signal(false);
  mount(parent, () => <button className={() => (selected.get() ? "font-bold" : "")}>Easy</button>);
  selected.set(true);
  assert.equal(parent.querySelector("button")?.className, "font-bold");
});

test("a live property given null is cleared", () => {
  const parent = host();
  const style = signal<string | null>("font-bold");
  const tip = signal<string | null>("Saves your changes");
  const text = signal<string | null>("Ada");
  mount(parent, () => (
    <input
      className={style as unknown as Signal<string>}
      title={tip as unknown as Signal<string>}
      value={text as unknown as Signal<string>}
    />
  ));
  const input = parent.querySelector("input");
  assert.ok(input);
  style.set(null);
  tip.set(null);
  text.set(null);
  assert.equal(input.getAttribute("class"), null);
  assert.equal(input.getAttribute("title"), null);
  assert.equal(input.value, "");
});

test("a live aria- attribute follows its signal", () => {
  const parent = host();
  const open = signal(false);
  mount(parent, () => <button aria-expanded={open}>Details</button>);
  const button = parent.querySelector("button");
  assert.ok(button);
  assert.equal(button.getAttribute("aria-expanded"), "false");
  open.set(true);
  assert.equal(button.getAttribute("aria-expanded"), "true");
});

test("a list inside a function is rebuilt whenever its signal changes", () => {
  const parent = host();
  const names = signal(["Ada", "Grace"]);
  mount(parent, () => (
    <ul>
      {() =>
        names.get().map((name) => (
          <li>{name}</li>
        ))
      }
    </ul>
  ));
  names.set(["Ada", "Grace", "Katherine"]);
  assert.deepEqual(
    [...parent.querySelectorAll("li")].map((item) => item.textContent),
    ["Ada", "Grace", "Katherine"],
  );
});

test("a component's own reads don't subscribe the spot that built it", () => {
  const parent = host();
  const theme = signal("light");
  const shown = signal(true);
  let runs = 0;
  function Badge() {
    runs++;
    return <span>{theme.get()}</span>;
  }
  mount(parent, () => <div>{() => shown.get() && <Badge />}</div>);
  theme.set("dark");
  assert.equal(runs, 1);
  assert.equal(parent.textContent, "light", "a value read with get() in JSX is read once");
});

test("a live value outside mount says where it belongs", () => {
  assert.throws(() => <p>{signal(1)}</p>, /mount/);
});
