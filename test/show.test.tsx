import { host } from "./dom.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mount, onCleanup, show, signal, watch } from "wobbui";

test("show keeps an input while what it doesn't show changes and while its condition stays true", () => {
  const parent = host();
  const count = signal(1);
  const name = signal("Ada");
  mount(parent, () => <form>{show(() => count.get() > 0, () => <input value={name} />, () => <p>No one</p>)}</form>);
  const input = parent.querySelector("input");
  assert.ok(input);
  name.set("Grace");
  count.set(2);
  // Compared with `===`: a failed `assert.equal` would print both elements, which takes happy-dom forever.
  assert.ok(parent.querySelector("input") === input, "the same input, so the user keeps their place in it");
  assert.equal(input.value, "Grace");
  count.set(0);
  assert.equal(parent.textContent, "No one");
  count.set(1);
  const rebuilt = parent.querySelector("input");
  assert.ok(rebuilt !== null && rebuilt !== input, "once the condition flips and flips back, it's built again");
});

test("show without a fallback shows nothing while its condition is false", () => {
  const parent = host();
  const open = signal(false);
  mount(parent, () => <section>{show(open, () => <p>More about this setting.</p>)}</section>);
  assert.equal(parent.textContent, "");
  open.set(true);
  assert.equal(parent.textContent, "More about this setting.");
});

test("what show built is cleaned up while it's on the page, when its condition flips", () => {
  const parent = host();
  const open = signal(true);
  const seen: string[] = [];
  mount(parent, () => (
    <section>
      {show(open, () => {
        onCleanup(() => seen.push(`closed, page showing "${parent.textContent}"`));
        return <p>Details</p>;
      })}
    </section>
  ));
  open.set(false);
  assert.deepEqual(seen, ['closed, page showing "Details"']);
  assert.equal(parent.textContent, "");
});

test("a part inside show never runs on a value that a change made during the same update uses to remove it", () => {
  const parent = host();
  const user = signal<{ name: string } | null>({ name: "Ada" });
  const idle = signal(0);
  function Profile() {
    // Made before the line below, so it runs first in an update, and its change reaches show only after it.
    watch(() => {
      if (idle.get() > 300) user.set(null);
    });
    return (
      <p>
        {() => {
          const current = user.get();
          if (current === null) throw new Error("ran on a user that's gone");
          return `${current.name}, idle ${idle.get()}s`;
        }}
      </p>
    );
  }
  mount(parent, () => <div>{show(user, () => <Profile />)}</div>);
  assert.equal(parent.textContent, "Ada, idle 0s");
  idle.set(301);
  assert.equal(parent.textContent, "");
});
