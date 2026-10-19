import assert from "node:assert/strict";
import { test } from "node:test";
import { signal, untracked, watch } from "wobbui";

test("get returns the value set last", () => {
  const volume = signal(5);
  volume.set(8);
  assert.equal(volume.get(), 8);
});

test("watch runs now, and again whenever a signal it read changes, until it's stopped", () => {
  const volume = signal(5);
  const heard: number[] = [];
  const stop = watch(() => heard.push(volume.get()));
  volume.set(6);
  volume.set(7);
  stop();
  volume.set(8);
  assert.deepEqual(heard, [5, 6, 7]);
});

test("setting the value a signal already holds runs nothing", () => {
  const volume = signal(5);
  let runs = 0;
  watch(() => {
    volume.get();
    runs++;
  });
  volume.set(5);
  assert.equal(runs, 1);
});

test("watch listens only to the signals it read the last time it ran", () => {
  const muted = signal(false);
  const volume = signal(5);
  let runs = 0;
  watch(() => {
    runs++;
    if (!muted.get()) volume.get();
  });
  muted.set(true);
  volume.set(6);
  assert.equal(runs, 2, "while muted, the volume isn't read, so changing it runs nothing");
  muted.set(false);
  volume.set(7);
  assert.equal(runs, 4);
});

test("a read inside untracked subscribes nothing", () => {
  const volume = signal(5);
  let runs = 0;
  watch(() => {
    untracked(() => volume.get());
    runs++;
  });
  volume.set(6);
  assert.equal(runs, 1);
});
