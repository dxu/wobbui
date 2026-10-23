import { host } from "./dom.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { batch, computed, mount, show, signal, untracked, watch, type Computed, type ReadonlySignal } from "wobbui";

test("a computed value follows the signals it read", () => {
  const count = signal(1);
  const doubled = computed(() => count.get() * 2);
  assert.equal(doubled.get(), 2);
  count.set(5);
  assert.equal(doubled.get(), 10);
});

test("a computed value computes when it's made, and again only when it's read after a change", () => {
  const count = signal(1);
  let runs = 0;
  const doubled = computed(() => {
    runs++;
    return count.get() * 2;
  });
  doubled.get();
  doubled.get();
  assert.equal(runs, 1, "reading it again computes nothing");
  count.set(2);
  count.set(3);
  assert.equal(runs, 1, "nor does a change no one reads");
  assert.equal(doubled.get(), 6);
  assert.equal(runs, 2);
});

test("a watch that reads two computed values fed by one signal runs once per change, and never sees a mix", () => {
  const count = signal(1);
  const doubled = computed(() => count.get() * 2);
  const tripled = computed(() => count.get() * 3);
  const seen: string[] = [];
  watch(() => seen.push(`${doubled.get()} ${tripled.get()}`));
  count.set(2);
  count.set(3);
  assert.deepEqual(seen, ["2 3", "4 6", "6 9"]);
});

test("a computed value that comes out the same doesn't run what reads it", () => {
  const count = signal(0);
  const even = computed(() => count.get() % 2 === 0);
  let runs = 0;
  watch(() => {
    even.get();
    runs++;
  });
  count.set(2);
  assert.equal(runs, 1);
  count.set(3);
  assert.equal(runs, 2);
});

test("a part that reads a computed value runs again only when the value changes", () => {
  const parent = host();
  const count = signal(0);
  const even = computed(() => count.get() % 2 === 0);
  let runs = 0;
  mount(parent, () => (
    <p>
      {() => {
        runs++;
        return even.get() ? "Even" : "Odd";
      }}
    </p>
  ));
  count.set(2);
  assert.equal(runs, 1);
  count.set(3);
  assert.equal(runs, 2);
  assert.equal(parent.textContent, "Odd");
});

test("a computed value given as a child or a property is live", () => {
  const parent = host();
  const count = signal(1);
  const doubled = computed(() => count.get() * 2);
  mount(parent, () => <p title={doubled}>{doubled}</p>);
  count.set(2);
  const paragraph = parent.querySelector("p");
  assert.equal(paragraph?.textContent, "4");
  assert.equal(paragraph?.title, "4");
});

test("a computed value can read another", () => {
  const count = signal(1);
  const doubled = computed(() => count.get() * 2);
  const label = computed(() => `${doubled.get()} items`);
  const heard: string[] = [];
  watch(() => heard.push(label.get()));
  count.set(2);
  assert.deepEqual(heard, ["2 items", "4 items"]);
});

test("a computed value keeps the error its function threw, and recovers when what it read changes", () => {
  const text = signal("1");
  let runs = 0;
  const number = computed(() => {
    runs++;
    const value = Number(text.get());
    if (Number.isNaN(value)) throw new Error(`not a number: ${text.get()}`);
    return value;
  });
  text.set("one");
  assert.throws(() => number.get(), /not a number: one/);
  assert.throws(() => number.get(), /not a number: one/);
  assert.equal(runs, 2, "it keeps the error rather than computing again");
  text.set("2");
  assert.equal(number.get(), 2);
});

test("a computed value whose function throws when it's made throws when it's read, not when it's made", () => {
  const broken = computed((): number => {
    throw new Error("broken");
  });
  assert.throws(() => broken.get(), /broken/);
});

test("what reads a computed value that throws runs again, reads the error, and runs again when it recovers", () => {
  const text = signal("1");
  const number = computed(() => {
    const value = Number(text.get());
    if (Number.isNaN(value)) throw new Error("not a number");
    return value;
  });
  const heard: string[] = [];
  watch(() => {
    try {
      heard.push(String(number.get()));
    } catch (error) {
      heard.push((error as Error).message);
    }
  });
  text.set("one");
  text.set("2");
  assert.deepEqual(heard, ["1", "not a number", "2"]);
});

test("a computed value made while HTML is built stops with it, and keeps its last value", () => {
  const parent = host();
  const count = signal(1);
  let runs = 0;
  let doubled: Computed<number> | undefined;
  const unmount = mount(parent, () => {
    doubled = computed(() => {
      runs++;
      return count.get() * 2;
    });
    return <p>{doubled}</p>;
  });
  count.set(2);
  assert.equal(parent.textContent, "4");
  unmount();
  count.set(3);
  assert.equal(doubled?.get(), 4);
  assert.equal(runs, 2, "it no longer computes");
});

test("a watch's computed values are brought up to date only as far as the first that changed", () => {
  const names = signal(["Ada"]);
  const any = computed(() => names.get().length > 0);
  let runs = 0;
  const first = computed(() => {
    runs++;
    return names.get()[0]?.toUpperCase();
  });
  const heard: string[] = [];
  watch(() => heard.push(any.get() ? `first: ${first.get()}` : "none"));
  names.set([]);
  assert.deepEqual(heard, ["first: ADA", "none"]);
  assert.equal(runs, 1, "the watch no longer reads `first`, so it isn't computed again");
});

test("a read inside untracked doesn't subscribe to a computed value", () => {
  const count = signal(1);
  const doubled = computed(() => count.get() * 2);
  let runs = 0;
  watch(() => {
    untracked(() => doubled.get());
    runs++;
  });
  count.set(2);
  assert.equal(runs, 1);
});

test("a change made inside a run runs what it affects after that run, in the order they were made", () => {
  const count = signal(0);
  const counting = signal(false);
  const log: string[] = [];
  watch(() => log.push(`count ${count.get()}`));
  watch(() => {
    if (!counting.get()) return;
    count.set(1);
    log.push("set");
  });
  counting.set(true);
  assert.deepEqual(log, ["count 0", "set", "count 1"]);
});

test("a part inside another stops before it can run on values that left it behind", () => {
  const parent = host();
  const user = signal<{ name: string } | null>({ name: "Ada" });
  const greeting = signal("Hello");
  mount(parent, () => (
    <div>
      {show(user, () => (
        <p>
          {() => {
            const signedIn = user.get();
            if (signedIn === null) throw new Error("ran after the user signed out");
            return `${greeting.get()}, ${signedIn.name}`;
          }}
        </p>
      ))}
    </div>
  ));
  // The part inside is told first, by `greeting`, but `show` runs first and removes it.
  batch(() => {
    greeting.set("Goodbye");
    user.set(null);
  });
  assert.equal(parent.textContent, "");
});

test("two watches that keep changing each other's signals stop with an error", () => {
  const ping = signal(0);
  const pong = signal(0);
  watch(() => pong.set(ping.get() + 1));
  assert.throws(() => watch(() => ping.set(pong.get() + 1)), /kept changing/);
});

test("a ReadonlySignal is a signal or a computed value, not any object with a get method", () => {
  const values: ReadonlySignal<number>[] = [signal(1), computed(() => 2)];
  // @ts-expect-error An object that merely has a get method isn't one: the test build fails if it's accepted.
  const fake: ReadonlySignal<number> = { get: () => 3 };
  void fake;
  assert.deepEqual(
    values.map((value) => value.get()),
    [1, 2],
  );
});
