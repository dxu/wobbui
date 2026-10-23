import { browser, host } from "./dom.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { catchError, mount, onCleanup, signal, watch } from "wobbui";

/** A component that fails to build. */
function Broken(): Node {
  throw new Error("broken component");
}

/** What `error` says. */
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

test("catchError shows its fallback when what it builds throws, and stops what that started", () => {
  const parent = host();
  const volume = signal(1);
  const heard: number[] = [];
  function Lab() {
    watch(() => heard.push(volume.get()));
    return <Broken />;
  }
  mount(parent, () => <main>{catchError(() => <Lab />, (error) => <p>Failed: {message(error)}</p>)}</main>);
  assert.equal(parent.textContent, "Failed: broken component");
  volume.set(2);
  assert.deepEqual(heard, [1], "the watch the failed build started no longer listens");
});

test("catchError shows its fallback when a part inside throws as it updates, after its cleanups", () => {
  const parent = host();
  const tab = signal("menu");
  const seen: string[] = [];
  mount(parent, () => (
    <main>
      {catchError(
        () => {
          onCleanup(() => seen.push(`cleaned up, page showing "${parent.textContent}"`));
          return (
            <div>
              {() => {
                if (tab.get() === "lab") throw new Error("the lab broke");
                return "Menu";
              }}
            </div>
          );
        },
        (error) => `Failed: ${message(error)}`,
      )}
    </main>
  ));
  tab.set("lab");
  assert.equal(parent.textContent, "Failed: the lab broke");
  assert.deepEqual(seen, ['cleaned up, page showing "Menu"']);
});

test("catchError catches an error from a part its function returns as it is", () => {
  const parent = host();
  const tab = signal("menu");
  mount(parent, () => (
    <main>
      {catchError(
        () => () => {
          if (tab.get() === "lab") throw new Error("the lab broke");
          return "Menu";
        },
        (error) => `Failed: ${message(error)}`,
      )}
    </main>
  ));
  tab.set("lab");
  assert.equal(parent.textContent, "Failed: the lab broke");
});

test("reset builds what catchError shows again", () => {
  const parent = host();
  const tab = signal("lab");
  mount(parent, () => (
    <main>
      {catchError(
        () => (
          <div>
            {() => {
              if (tab.get() === "lab") throw new Error("the lab broke");
              return "Menu";
            }}
          </div>
        ),
        (_error, reset) => <button onclick={reset}>Try again</button>,
      )}
    </main>
  ));
  assert.equal(parent.textContent, "Try again");
  tab.set("menu");
  assert.equal(parent.textContent, "Try again", "the fallback stays until it's reset");
  parent.querySelector("button")?.click();
  assert.equal(parent.textContent, "Menu");
});

test("an error outside catchError is still thrown", () => {
  const parent = host();
  const tab = signal("menu");
  mount(parent, () => (
    <main>
      {catchError(
        () => <p>Fine</p>,
        () => "Failed",
      )}
      {() => {
        if (tab.get() === "lab") throw new Error("the lab broke");
        return "Menu";
      }}
    </main>
  ));
  assert.throws(() => tab.set("lab"), /the lab broke/);
  assert.equal(parent.textContent, "FineMenu");
});

test("an error from a fallback goes to the catchError around it", () => {
  const parent = host();
  const tab = signal("menu");
  mount(parent, () => (
    <main>
      {catchError(
        () => (
          <section>
            {catchError(
              () => (
                <div>
                  {() => {
                    if (tab.get() === "lab") throw new Error("the lab broke");
                    return "Menu";
                  }}
                </div>
              ),
              () => {
                throw new Error("the fallback broke");
              },
            )}
          </section>
        ),
        (error) => `Outer: ${message(error)}`,
      )}
    </main>
  ));
  assert.equal(parent.textContent, "Menu");
  tab.set("lab");
  assert.equal(parent.textContent, "Outer: the fallback broke");
});

test("an error as a dialog a component mounted updates reaches the component's catchError", () => {
  const page = host();
  const overlay = host();
  const step = signal(1);
  function Wizard() {
    mount(overlay, () => (
      <dialog open>
        {() => {
          if (step.get() > 2) throw new Error("no such step");
          return `Step ${step.get()}`;
        }}
      </dialog>
    ));
    return <p>Wizard</p>;
  }
  mount(page, () => <main>{catchError(() => <Wizard />, (error) => `Failed: ${message(error)}`)}</main>);
  step.set(3);
  assert.equal(page.textContent, "Failed: no such step");
  assert.equal(overlay.childNodes.length, 0, "the dialog went with the HTML that mounted it");
});

test("an event handler's error isn't caught: it reaches the browser", () => {
  const parent = host();
  const errors: unknown[] = [];
  browser.addEventListener("error", (event) => errors.push((event as unknown as ErrorEvent).error));
  mount(parent, () => (
    <main>
      {catchError(
        () => (
          <button
            onclick={() => {
              throw new Error("the click broke");
            }}
          >
            Go
          </button>
        ),
        () => "Failed",
      )}
    </main>
  ));
  parent.querySelector("button")?.click();
  assert.equal(message(errors[0]), "the click broke");
  assert.equal(parent.textContent, "Go");
});
