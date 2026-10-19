import assert from "node:assert/strict";
import { test } from "node:test";
import { onCleanup, signal, untracked, watch } from "wobbui";

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

test("a watch that changes a signal it reads runs again, and ends on the settled value", () => {
  const volume = signal(5);
  const shown: number[] = [];
  watch(() => {
    const value = volume.get();
    if (value > 10) volume.set(10);
    else shown.push(value);
  });
  volume.set(15);
  assert.equal(volume.get(), 10);
  assert.deepEqual(shown, [5, 10]);
});

test("a watch that never settles stops with an error", () => {
  const count = signal(0);
  assert.throws(() => watch(() => count.set(count.get() + 1)), /kept changing/);
  const stopped = count.get();
  count.set(stopped + 1);
  assert.equal(count.get(), stopped + 1, "the watch that threw was stopped");
});

test("what a watch's run starts is stopped before its next run", () => {
  const selected = signal("a");
  const volume = signal(1);
  const heard: string[] = [];
  watch(() => {
    const name = selected.get();
    watch(() => heard.push(`${name}${volume.get()}`));
  });
  selected.set("b");
  volume.set(2);
  assert.deepEqual(heard, ["a1", "b1", "b2"], "only the watch from the latest run still listens");
});

test("onCleanup in a watch runs before the next run, and when it stops", () => {
  const volume = signal(1);
  const log: string[] = [];
  const stop = watch(() => {
    const value = volume.get();
    log.push(`start ${value}`);
    onCleanup(() => log.push(`clean ${value}`));
  });
  volume.set(2);
  stop();
  assert.deepEqual(log, ["start 1", "clean 1", "start 2", "clean 2"]);
});

test("a signal read in a watch's onCleanup doesn't make the watch run again", () => {
  const volume = signal(1);
  const muted = signal(false);
  let runs = 0;
  watch(() => {
    runs++;
    volume.get();
    onCleanup(() => muted.get());
  });
  volume.set(2);
  muted.set(true);
  assert.equal(runs, 2);
});

test("set runs every watcher even when one throws, then throws the first error", () => {
  const volume = signal(1);
  const heard: number[] = [];
  watch(() => {
    if (volume.get() > 1) throw new Error("too loud");
  });
  watch(() => heard.push(volume.get()));
  assert.throws(() => volume.set(2), /too loud/);
  assert.deepEqual(heard, [1, 2]);
});

test("a watch whose cleanup throws still runs again, and keeps listening", () => {
  const volume = signal(1);
  const heard: number[] = [];
  watch(() => {
    const value = volume.get();
    heard.push(value);
    if (value === 1) {
      onCleanup(() => {
        throw new Error("the old player was already closed");
      });
    }
  });
  assert.throws(() => volume.set(2), /already closed/, "the error still reaches the code that set the signal");
  volume.set(3);
  assert.deepEqual(heard, [1, 2, 3]);
});

test("a watch whose cleanup throws still runs once more when it changes a signal it reads", () => {
  const volume = signal(5);
  const heard: number[] = [];
  watch(() => {
    const value = volume.get();
    heard.push(value);
    if (value > 10) volume.set(10);
    if (value === 5) {
      onCleanup(() => {
        throw new Error("the old player was already closed");
      });
    }
  });
  assert.throws(() => volume.set(15), /already closed/);
  assert.deepEqual(heard, [5, 15, 10], "the last run sees the settled value");
});

test("when a cleanup and the run after it both throw, the cleanup's error, the first, is rethrown", () => {
  const volume = signal(1);
  watch(() => {
    if (volume.get() > 1) throw new Error("the run failed");
    onCleanup(() => {
      throw new Error("the cleanup failed");
    });
  });
  assert.throws(() => volume.set(2), /the cleanup failed/);
});

test("a watch whose first run throws is stopped", () => {
  const volume = signal(1);
  let runs = 0;
  assert.throws(
    () =>
      watch(() => {
        runs++;
        volume.get();
        throw new Error("broken");
      }),
    /broken/,
  );
  volume.set(2);
  assert.equal(runs, 1);
});

test("onCleanup outside mount or watch says where it belongs", () => {
  assert.throws(() => onCleanup(() => {}), /mount\(\) or watch\(\)/);
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
