import { host } from "./dom.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { catchError, getOwner, mount, runWithOwner, signal, watch, type Owner } from "wobbui";

/** A dialog that fails to build. */
function Broken(): Node {
  throw new Error("broken dialog");
}

test("a dialog mounted from a click with its page's owner is unmounted with the page", () => {
  const page = host();
  const overlay = host();
  function Settings() {
    const owner = getOwner();
    const open = () => runWithOwner(owner, () => mount(overlay, () => <dialog open>Saved</dialog>));
    return <button onclick={open}>Save</button>;
  }
  const unmount = mount(page, () => <Settings />);
  page.querySelector("button")?.click();
  assert.equal(overlay.textContent, "Saved");
  unmount();
  assert.equal(overlay.childNodes.length, 0);
});

test("a dialog mounted after an await with its page's owner is unmounted with the page", async () => {
  const page = host();
  const overlay = host();
  let saving: Promise<void> | undefined;
  function Settings() {
    const owner = getOwner();
    async function save() {
      await Promise.resolve();
      runWithOwner(owner, () => mount(overlay, () => <dialog open>Saved</dialog>));
    }
    return <button onclick={() => (saving = save())}>Save</button>;
  }
  const unmount = mount(page, () => <Settings />);
  page.querySelector("button")?.click();
  await saving;
  assert.equal(overlay.textContent, "Saved");
  unmount();
  assert.equal(overlay.childNodes.length, 0);
});

test("an error building a dialog with its page's owner reaches the page's catchError", () => {
  const page = host();
  const overlay = host();
  function Settings() {
    const owner = getOwner();
    return <button onclick={() => runWithOwner(owner, () => mount(overlay, () => <Broken />))}>Save</button>;
  }
  mount(page, () => (
    <main>
      {catchError(
        () => <Settings />,
        (error) => `Failed: ${(error as Error).message}`,
      )}
    </main>
  ));
  page.querySelector("button")?.click();
  assert.equal(page.textContent, "Failed: broken dialog");
  assert.equal(overlay.childNodes.length, 0);
});

test("runWithOwner returns what its function returns, or undefined when a catchError takes its error", () => {
  let owner: Owner | undefined;
  mount(host(), () => (
    <main>
      {catchError(
        () => {
          owner = getOwner();
          return "Page";
        },
        () => "Failed",
      )}
    </main>
  ));
  assert.equal(
    runWithOwner(owner, () => 42),
    42,
  );
  assert.equal(
    runWithOwner(owner, () => {
      throw new Error("broken");
    }),
    undefined,
  );
});

test("with no catchError around its owner, runWithOwner throws its function's error", () => {
  let owner: Owner | undefined;
  mount(host(), () => {
    owner = getOwner();
    return <p>Page</p>;
  });
  assert.throws(
    () =>
      runWithOwner(owner, () => {
        throw new Error("broken");
      }),
    /broken/,
  );
});

test("what's made with an owner that has gone stops at once", () => {
  const overlay = host();
  let owner: Owner | undefined;
  const unmount = mount(host(), () => {
    owner = getOwner();
    return <p>Page</p>;
  });
  unmount();
  const volume = signal(1);
  const heard: number[] = [];
  runWithOwner(owner, () => {
    mount(overlay, () => <dialog open>Too late</dialog>);
    watch(() => heard.push(volume.get()));
  });
  volume.set(2);
  assert.equal(overlay.childNodes.length, 0);
  assert.deepEqual(heard, []);
});

test("an error with an owner whose catchError has gone is thrown, not lost", () => {
  let owner: Owner | undefined;
  const unmount = mount(host(), () => (
    <main>
      {catchError(
        () => {
          owner = getOwner();
          return "Page";
        },
        () => "Failed",
      )}
    </main>
  ));
  unmount();
  assert.throws(
    () =>
      runWithOwner(owner, () => {
        throw new Error("too late");
      }),
    /too late/,
  );
});

test("getOwner is undefined outside anything being built, and an owner shows nothing of itself", () => {
  const owner = getOwner();
  assert.equal(owner, undefined);
  // Never run: the test build type-checks it, and fails if an owner shows a method.
  // @ts-expect-error An owner has nothing to call.
  const dispose = () => owner?.dispose();
  void dispose;
});

test("runWithOwner gives a catchError only its own errors: one from a watch it set off reaches the caller", () => {
  const parent = host();
  const overlay = host();
  const saves = signal(0);
  watch(() => {
    if (saves.get() > 0) throw new Error("analytics offline");
  });
  let owner: Owner | undefined;
  mount(parent, () => (
    <main>
      {catchError(
        () => {
          owner = getOwner();
          return <p>Settings</p>;
        },
        (error) => <p>{String(error)}</p>,
      )}
    </main>
  ));
  assert.throws(
    () =>
      runWithOwner(owner, () => {
        saves.set(1);
        mount(overlay, () => <dialog open>Saved</dialog>);
      }),
    /analytics offline/,
  );
  assert.equal(overlay.textContent, "Saved", "the dialog was still made");
  assert.equal(parent.textContent, "Settings", "the page's catchError didn't take the other watch's error");
});
