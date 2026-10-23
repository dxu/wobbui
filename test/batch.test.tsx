import { host } from "./dom.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { batch, computed, mount, signal, watch } from "wobbui";

test("batch runs what two changes affect once, after it, and reads inside see the new values", () => {
  const first = signal("Ada");
  const last = signal("Lovelace");
  const full = computed(() => `${first.get()} ${last.get()}`);
  const heard: string[] = [];
  watch(() => heard.push(full.get()));
  const inside = batch(() => {
    first.set("Grace");
    last.set("Hopper");
    assert.deepEqual(heard, ["Ada Lovelace"], "nothing runs inside");
    return [first.get(), full.get()];
  });
  assert.deepEqual(inside, ["Grace", "Grace Hopper"]);
  assert.deepEqual(heard, ["Ada Lovelace", "Grace Hopper"]);
});

test("batches nest, and only the outermost runs what they changed", () => {
  const volume = signal(1);
  const heard: number[] = [];
  watch(() => heard.push(volume.get()));
  batch(() => {
    batch(() => volume.set(2));
    assert.deepEqual(heard, [1], "the inner batch runs nothing");
    volume.set(3);
  });
  assert.deepEqual(heard, [1, 3]);
});

test("a batch that throws still runs what it changed, and throws its own error", () => {
  const volume = signal(1);
  const heard: number[] = [];
  watch(() => heard.push(volume.get()));
  watch(() => {
    if (volume.get() > 1) throw new Error("too loud");
  });
  assert.throws(
    () =>
      batch(() => {
        volume.set(2);
        throw new Error("half done");
      }),
    /half done/,
  );
  assert.deepEqual(heard, [1, 2]);
});

test("an event handler that sets two signals updates the page once", () => {
  const parent = host();
  const first = signal("Ada");
  const last = signal("Lovelace");
  let runs = 0;
  mount(parent, () => (
    <div>
      <p>
        {() => {
          runs++;
          return `${first.get()} ${last.get()}`;
        }}
      </p>
      <button
        onclick={() => {
          first.set("Grace");
          last.set("Hopper");
        }}
      >
        Rename
      </button>
    </div>
  ));
  parent.querySelector("button")?.click();
  assert.equal(parent.querySelector("p")?.textContent, "Grace Hopper");
  assert.equal(runs, 2);
});
