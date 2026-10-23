import { host } from "./dom.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mount, onCleanup, signal } from "wobbui";

test("a signal child changes its text in place", () => {
  const parent = host();
  const count = signal(1);
  mount(parent, () => <p>Count: {count}</p>);
  const paragraph = parent.querySelector("p");
  assert.ok(paragraph);
  const text = [...paragraph.childNodes].find((node) => node.textContent === "1");
  count.set(2);
  assert.equal(paragraph.textContent, "Count: 2");
  assert.equal(text?.textContent, "2", "the same text node shows the new count");
});

test("live spots keep updating after the page's text is normalized, even one showing empty text", () => {
  const parent = host();
  const count = signal(1);
  const name = signal("");
  mount(parent, () => (
    <p>
      Count: {count}, name: {name}
    </p>
  ));
  parent.normalize();
  count.set(2);
  name.set("Ada");
  assert.equal(parent.textContent, "Count: 2, name: Ada");
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

test("a function child that shows text stops what its last run started, and keeps what this run started", () => {
  const parent = host();
  const id = signal(1);
  const polling = new Set<number>();
  mount(parent, () => (
    <p>
      {() => {
        const current = id.get();
        polling.add(current);
        onCleanup(() => polling.delete(current));
        return "Polling";
      }}
    </p>
  ));
  id.set(2);
  id.set(3);
  assert.deepEqual([...polling], [3]);
  assert.equal(parent.textContent, "Polling");
});

test("when a function child switches from text to an element, what its last text run started stops", () => {
  const parent = host();
  const step = signal(1);
  const running = new Set<number>();
  mount(parent, () => (
    <p>
      {() => {
        const current = step.get();
        running.add(current);
        onCleanup(() => running.delete(current));
        return current < 3 ? `Step ${current}` : <b>Done</b>;
      }}
    </p>
  ));
  step.set(2);
  assert.deepEqual([...running], [2], "while the text shows, what its run started keeps going");
  step.set(3);
  assert.deepEqual([...running], [3]);
  assert.equal(parent.textContent, "Done");
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
  mount(parent, () => <input className={style} title={tip} value={text} />);
  const input = parent.querySelector("input");
  assert.ok(input);
  style.set(null);
  tip.set(null);
  text.set(null);
  assert.equal(input.getAttribute("class"), null);
  assert.equal(input.getAttribute("title"), null);
  assert.equal(input.value, "");
});

test("a live valueAsNumber, valueAsDate or selectedIndex given null is cleared", () => {
  const parent = host();
  const amount = signal<number | null>(5);
  const due = signal<Date | null>(new Date("2026-10-22"));
  const size = signal<number | null>(1);
  mount(parent, () => (
    <form>
      <input type="number" valueAsNumber={amount} />
      <input type="date" valueAsDate={due} />
      <select selectedIndex={size}>
        <option>Small</option>
        <option>Large</option>
      </select>
    </form>
  ));
  const [amountInput, dueInput] = parent.querySelectorAll("input");
  const select = parent.querySelector("select");
  assert.ok(amountInput && dueInput && select);
  assert.equal(amountInput.value, "5");
  assert.equal(dueInput.value, "2026-10-22");
  assert.equal(select.selectedIndex, 1);
  amount.set(null);
  due.set(null);
  size.set(null);
  assert.equal(amountInput.value, "");
  assert.equal(dueInput.value, "");
  assert.equal(select.selectedIndex, -1);
});

test("null removes the attribute a property reflects: a progress bar's value, an option's, and an input's default", () => {
  const parent = host();
  const loaded = signal<number | null>(0.5);
  const code = signal<string | null>("nl");
  const initial = signal<string | null>("Ada");
  mount(parent, () => (
    <form>
      <progress value={loaded} />
      <select>
        <option value={code}>Dutch</option>
      </select>
      <input defaultValue={initial} />
    </form>
  ));
  const progress = parent.querySelector("progress");
  const option = parent.querySelector("option");
  const input = parent.querySelector("input");
  assert.ok(progress && option && input);
  assert.equal(progress.getAttribute("value"), "0.5");
  assert.equal(option.value, "nl");
  assert.equal(input.getAttribute("value"), "Ada");
  loaded.set(null);
  code.set(null);
  initial.set(null);
  assert.equal(progress.getAttribute("value"), null, "the bar shows it's still loading");
  assert.equal(option.value, "Dutch", "the option's value is its text again");
  assert.equal(input.getAttribute("value"), null);
});

test("null clears an option's selected and an element's innerText", () => {
  const parent = host();
  const chosen = signal<boolean | null>(true);
  const note = signal<string | null>("Saved");
  mount(parent, () => (
    <div>
      <select>
        <option>Small</option>
        <option selected={chosen}>Large</option>
      </select>
      <p innerText={note} />
    </div>
  ));
  const option = parent.querySelectorAll("option")[1];
  const paragraph = parent.querySelector("p");
  assert.ok(option && paragraph);
  assert.equal(option.selected, true);
  assert.equal(paragraph.textContent, "Saved");
  chosen.set(null);
  note.set(null);
  assert.equal(option.selected, false);
  assert.equal(paragraph.textContent, "");
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

test("a function child shows its new HTML even when a cleanup in the HTML it replaces throws", () => {
  const parent = host();
  const tab = signal("clock");
  mount(parent, () => <div>{() => (tab.get() === "clock" ? <Clock /> : <p>Settings</p>)}</div>);
  assert.throws(() => tab.set("settings"), /already removed/, "the error still reaches the code that set the signal");
  assert.equal(parent.textContent, "Settings");
  tab.set("clock");
  assert.equal(parent.textContent, "Clock", "the spot still follows its signal");
});

test("a function child keeps the HTML it shows when the function throws", () => {
  const parent = host();
  const tab = signal("menu");
  mount(parent, () => (
    <div>
      {() => {
        if (tab.get() === "lab") throw new Error("the lab broke");
        return <p>Menu</p>;
      }}
    </div>
  ));
  assert.throws(() => tab.set("lab"), /the lab broke/);
  assert.equal(parent.textContent, "Menu");
});

test("if a function child throws and its cleanup throws too, the function's error is the one thrown", () => {
  const parent = host();
  const tab = signal("menu");
  mount(parent, () => (
    <div>
      {() => {
        if (tab.get() === "menu") return "Menu";
        onCleanup(() => {
          throw new Error("the cleanup failed");
        });
        throw new Error("the lab broke");
      }}
    </div>
  ));
  assert.throws(() => tab.set("lab"), /the lab broke/);
});

test("a function child can show again an element it showed before", () => {
  const parent = host();
  const user = signal("Ada");
  const profile = <p>Profile</p>;
  mount(parent, () => <div>{() => (user.get() === "" ? "Sign in" : profile)}</div>);
  user.set("Grace");
  assert.equal(parent.textContent, "Profile");
});

test("a function child can show an element it showed before inside its new HTML", () => {
  const parent = host();
  const wide = signal(false);
  const name = signal("Ada");
  mount(parent, () => {
    const profile = <p>{name}</p>;
    return <div>{() => (wide.get() ? <aside>{profile}</aside> : profile)}</div>;
  });
  wide.set(true);
  name.set("Grace");
  assert.equal(parent.querySelector("aside")?.textContent, "Grace", "it moved, and its live parts still update");
  wide.set(false);
  assert.equal(parent.textContent, "Grace", "and it shows on its own again");
});

test("an element one function child takes from another stays when the other rebuilds", () => {
  const parent = host();
  const side = signal("left");
  const profile = <p>Profile</p>;
  mount(parent, () => (
    <div>
      <section>{() => (side.get() === "left" ? profile : "Empty")}</section>
      <aside>{() => (side.get() === "right" ? profile : "Empty")}</aside>
    </div>
  ));
  side.set("right");
  assert.equal(parent.querySelector("aside")?.textContent, "Profile");
  side.set("left");
  assert.equal(parent.querySelector("section")?.textContent, "Profile");
  assert.equal(parent.querySelector("aside")?.textContent, "Empty");
});

test("an element one function child takes from a sibling stays when the sibling rebuilds", () => {
  const parent = host();
  const side = signal("left");
  const profile = <p>Profile</p>;
  mount(parent, () => (
    <div>
      {() => (side.get() === "left" ? profile : "Empty")}
      {() => (side.get() === "right" ? profile : "Empty")}
    </div>
  ));
  side.set("right");
  assert.equal(parent.textContent, "EmptyProfile");
  side.set("left");
  assert.equal(parent.textContent, "ProfileEmpty");
});

test("when a function child rebuilds, a function child it returned goes too, even one that has rebuilt", () => {
  const parent = host();
  const page = signal("list");
  const on = signal(false);
  mount(parent, () => (
    <div>{() => (page.get() === "list" ? [() => (on.get() ? <b>On</b> : <i>Off</i>)] : "Done")}</div>
  ));
  on.set(true);
  page.set("done");
  assert.equal(parent.textContent, "Done");
});

test("when a function child's new HTML fails to build, the spots it started stop", () => {
  const parent = host();
  const page = signal("menu");
  const volume = signal(1);
  const heard: number[] = [];
  mount(parent, () => (
    <div>
      {() =>
        page.get() === "menu"
          ? "Menu"
          : [
              () => {
                heard.push(volume.get());
                return "Lab";
              },
              () => {
                throw new Error("the lab broke");
              },
            ]
      }
    </div>
  ));
  assert.throws(() => page.set("lab"), /the lab broke/);
  volume.set(2);
  assert.deepEqual(heard, [1], "the spot built before the failure no longer listens");
});

test("a function child shows text again after a rebuild that failed", () => {
  const parent = host();
  const status = signal<string | null>("Ready");
  mount(parent, () => (
    <p>
      {() =>
        status.get() ?? [
          () => {
            throw new Error("no status");
          },
        ]
      }
    </p>
  ));
  assert.throws(() => status.set(null), /no status/);
  status.set("Done");
  assert.equal(parent.textContent, "Done");
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

/** A component whose cleanup throws, as one removing an element that's already gone would. */
function Clock() {
  onCleanup(() => {
    throw new Error("the element was already removed");
  });
  return <p>Clock</p>;
}
