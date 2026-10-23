import { host } from "./dom.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mount, onCleanup, signal, watch } from "wobbui";

test("unmount removes the HTML and stops its live spots", () => {
  const parent = host();
  const count = signal(0);
  let reads = 0;
  const unmount = mount(parent, () => (
    <p>
      {() => {
        reads++;
        return count.get();
      }}
    </p>
  ));
  unmount();
  count.set(1);
  assert.equal(parent.childNodes.length, 0);
  assert.equal(reads, 1);
});

test("a watch made while building stops when the HTML is unmounted", () => {
  const parent = host();
  const volume = signal(5);
  const heard: number[] = [];
  const unmount = mount(parent, () => {
    watch(() => heard.push(volume.get()));
    return <p>Volume</p>;
  });
  volume.set(6);
  unmount();
  volume.set(7);
  assert.deepEqual(heard, [5, 6]);
});

test("a mount made while building goes with the HTML that made it", () => {
  const page = host();
  const overlay = host();
  function Dialog() {
    mount(overlay, () => <dialog open>Saved</dialog>);
    return <p>Settings</p>;
  }
  const unmount = mount(page, () => <Dialog />);
  assert.equal(overlay.textContent, "Saved");
  unmount();
  assert.equal(overlay.childNodes.length, 0);
});

test("onCleanup in a component runs when its HTML is unmounted", () => {
  const parent = host();
  let ticking = false;
  function Clock() {
    ticking = true;
    onCleanup(() => (ticking = false));
    return <p>12:00</p>;
  }
  const unmount = mount(parent, () => <Clock />);
  assert.equal(ticking, true);
  unmount();
  assert.equal(ticking, false);
});

test("onCleanup in a part that rebuilds runs when that part is rebuilt", () => {
  const parent = host();
  const page = signal("home");
  const log: string[] = [];
  mount(parent, () => (
    <main>
      {() => {
        const name = page.get();
        onCleanup(() => log.push(`left ${name}`));
        return <h1>{name}</h1>;
      }}
    </main>
  ));
  page.set("settings");
  assert.deepEqual(log, ["left home"]);
  assert.equal(parent.textContent, "settings");
});

test("a part that rebuilds stops what its last run started before it runs again, as a watch does", () => {
  const parent = host();
  const page = signal("home");
  const log: string[] = [];
  mount(parent, () => (
    <main>
      {() => {
        const name = page.get();
        log.push(`show ${name}`);
        onCleanup(() => log.push(`leave ${name}`));
        return <h1>{name}</h1>;
      }}
    </main>
  ));
  page.set("settings");
  assert.deepEqual(log, ["show home", "leave home", "show settings"]);
  assert.equal(parent.textContent, "settings");
});

test("a part whose last run's cleanup unmounts its HTML doesn't run again", () => {
  const parent = host();
  const tick = signal(0);
  const log: string[] = [];
  const unmount = mount(parent, () => (
    <p>
      {() => {
        const count = tick.get();
        log.push(`run ${count}`);
        onCleanup(() => {
          log.push(`cleanup ${count}`);
          unmount();
        });
        return `tick ${count}`;
      }}
    </p>
  ));
  tick.set(1);
  assert.deepEqual(log, ["run 0", "cleanup 0"]);
  assert.equal(parent.childNodes.length, 0);
});

test("cleanups run while their HTML, live parts and all, is still on the page, and then it's removed", () => {
  const parent = host();
  const page = signal("home");
  const greeting = signal("hello");
  const seen: string[] = [];
  function Page(props: { name: string }) {
    onCleanup(() => seen.push(`${props.name} left, page showing "${parent.textContent}"`));
    return (
      <h1>
        {props.name}, {greeting}
      </h1>
    );
  }
  const unmount = mount(parent, () => {
    onCleanup(() => seen.push(`unmounted, page showing "${parent.textContent}"`));
    return <main>{() => <Page name={page.get()} />}</main>;
  });
  page.set("settings");
  unmount();
  assert.deepEqual(seen, [
    'home left, page showing "home, hello"',
    'settings left, page showing "settings, hello"',
    'unmounted, page showing "settings, hello"',
  ]);
  assert.equal(parent.childNodes.length, 0);
});

test("a part that throws while rebuilding stops what it started", () => {
  const parent = host();
  const broken = signal(false);
  const volume = signal(1);
  const heard: number[] = [];
  mount(parent, () => (
    <p>
      {() => {
        if (!broken.get()) return "fine";
        watch(() => heard.push(volume.get()));
        throw new Error("broken part");
      }}
    </p>
  ));
  assert.throws(() => broken.set(true), /broken part/);
  volume.set(2);
  assert.deepEqual(heard, [1]);
});

test("if adding the HTML to the parent throws, what was started stops", () => {
  const full = {
    appendChild() {
      throw new Error("no room");
    },
  } as unknown as Node;
  const volume = signal(1);
  const heard: number[] = [];
  assert.throws(
    () =>
      mount(full, () => {
        watch(() => heard.push(volume.get()));
        return <p>Volume</p>;
      }),
    /no room/,
  );
  volume.set(2);
  assert.deepEqual(heard, [1]);
});

test("a mount whose owner goes while it's being built is removed as soon as it's added", () => {
  const parent = host();
  const opened = signal(false);
  const stop = watch(() => {
    const closing = opened.get();
    mount(parent, () => {
      if (closing) stop();
      return <p>Dialog</p>;
    });
  });
  opened.set(true);
  assert.equal(parent.childNodes.length, 0);
});

test("unmounting twice does nothing the second time", () => {
  const parent = host();
  const unmount = mount(parent, () => <p>Once</p>);
  unmount();
  unmount();
  assert.equal(parent.childNodes.length, 0);
});

test("if building throws, nothing is added, and live spots made so far stop", () => {
  const parent = host();
  const volume = signal(5);
  const heard: number[] = [];
  assert.throws(
    () =>
      mount(parent, () => {
        watch(() => heard.push(volume.get()));
        throw new Error("broken component");
      }),
    /broken component/,
  );
  volume.set(6);
  assert.equal(parent.childNodes.length, 0);
  assert.deepEqual(heard, [5]);
});

test("unmount leaves an element that another mount has taken since", () => {
  const first = host();
  const second = host();
  const panel = <p>Panel</p>;
  const unmountFirst = mount(first, () => panel);
  mount(second, () => panel);
  unmountFirst();
  assert.equal(second.textContent, "Panel");
  assert.equal(first.childNodes.length, 0, "and leaves nothing behind where it was");
});

test("unmount leaves an element that a later mount in the same parent has taken", () => {
  const parent = host();
  const panel = <p>Panel</p>;
  const unmountFirst = mount(parent, () => panel);
  mount(parent, () => panel);
  unmountFirst();
  assert.equal(parent.textContent, "Panel");
});

test("unmount stops the live spots it built inside an element another mount has taken, keeping what they showed", () => {
  const first = host();
  const second = host();
  const count = signal(1);
  let card = <p />;
  const unmountFirst = mount(first, () => (card = <p>Count: {count}</p>));
  mount(second, () => card);
  unmountFirst();
  count.set(2);
  assert.equal(second.textContent, "Count: 1");
});

test("if the parent refuses the HTML, an element shown elsewhere stays where it was", () => {
  const shelf = host();
  const panel = <p>Panel</p>;
  shelf.append(panel);
  const refusing = {
    appendChild: (node: Node) => node,
    insertBefore() {
      throw new Error("no room");
    },
  } as unknown as Node;
  assert.throws(() => mount(refusing, () => panel), /no room/);
  assert.equal(shelf.textContent, "Panel");
});

test("if building throws and a cleanup then throws too, the error from building is the one thrown", () => {
  assert.throws(
    () =>
      mount(host(), () => {
        onCleanup(() => {
          throw new Error("the cleanup failed");
        });
        throw new Error("broken component");
      }),
    /broken component/,
  );
});
