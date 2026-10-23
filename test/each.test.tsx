import { browser, host } from "./dom.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { each, mount, onCleanup, signal, watch } from "wobbui";

/** The text of each item in `parent`'s list. */
function texts(parent: HTMLElement): (string | null)[] {
  return [...parent.querySelectorAll("li")].map((item) => item.textContent);
}

test("each builds an item's HTML once, and keeps its elements, moved, when the list changes", () => {
  const parent = host();
  const names = signal(["Ada", "Grace", "Katherine", "Mary"]);
  const built: string[] = [];
  mount(parent, () => (
    <ul>
      {each(names, (name) => {
        built.push(name);
        return <li>{name}</li>;
      })}
    </ul>
  ));
  const [ada, grace, katherine] = parent.querySelectorAll("li");
  names.set(["Katherine", "Ada", "Hedy", "Grace"]);
  assert.deepEqual(texts(parent), ["Katherine", "Ada", "Hedy", "Grace"]);
  // Compared with `===`: a failed `assert.equal` would print both elements, which takes happy-dom forever.
  const items = [...parent.querySelectorAll("li")];
  assert.ok(items[0] === katherine && items[1] === ada && items[3] === grace, "the same elements, moved");
  assert.deepEqual(built, ["Ada", "Grace", "Katherine", "Mary", "Hedy"], "only the new item was built");
  names.set([]);
  assert.deepEqual(texts(parent), []);
  names.set(["Mary", "Ada"]);
  assert.deepEqual(texts(parent), ["Mary", "Ada"]);
});

test("rows already in their place aren't touched: adding an item adds only its nodes", () => {
  const parent = host();
  const names = signal(["Ada", "Grace", "Katherine"]);
  mount(parent, () => <ul>{each(names, (name) => <li>{name}</li>)}</ul>);
  const list = parent.querySelector("ul");
  assert.ok(list);
  const changes = new browser.MutationObserver(() => {});
  changes.observe(list as unknown as Parameters<typeof changes.observe>[0], { childList: true });
  names.set(["Ada", "Grace", "Katherine", "Mary"]);
  const records = changes.takeRecords();
  assert.equal(records.reduce((removed, record) => removed + record.removedNodes.length, 0), 0, "nothing removed");
  assert.equal(records.reduce((added, record) => added + record.addedNodes.length, 0), 3, "Mary's markers and item");
});

test("an item's live parts keep updating after it moves", () => {
  const parent = host();
  const ada = { name: signal("Ada") };
  const grace = { name: signal("Grace") };
  const people = signal([ada, grace]);
  mount(parent, () => <ul>{each(people, (person) => <li>{person.name}</li>)}</ul>);
  people.set([grace, ada]);
  ada.name.set("Ada Lovelace");
  assert.deepEqual(texts(parent), ["Grace", "Ada Lovelace"]);
});

test("a gone item's HTML is removed once its cleanups have run, while it was still on the page", () => {
  const parent = host();
  const names = signal(["Ada", "Grace"]);
  const seen: string[] = [];
  mount(parent, () => (
    <ul>
      {each(names, (name) => {
        onCleanup(() => seen.push(`${name} left, list showing "${parent.textContent}"`));
        return <li>{name}</li>;
      })}
    </ul>
  ));
  names.set(["Grace"]);
  assert.deepEqual(seen, ['Ada left, list showing "AdaGrace"']);
  assert.deepEqual(texts(parent), ["Grace"]);
  assert.equal(parent.querySelector("ul")?.childNodes.length, 4, "the list's marker, and the row's markers and item");
});

test("an item that's in the list twice gets two rows, kept in order", () => {
  const parent = host();
  const names = signal(["Ada", "Grace", "Ada"]);
  mount(parent, () => <ul>{each(names, (name) => <li>{name}</li>)}</ul>);
  const [first, , second] = parent.querySelectorAll("li");
  names.set(["Ada", "Ada"]);
  const items = [...parent.querySelectorAll("li")];
  assert.equal(items.length, 2);
  assert.ok(items[0] === first && items[1] === second, "the first Ada's row first, then the second's");
  names.set(["Ada"]);
  assert.ok(parent.querySelector("li") === first, "the first row is the one kept");
});

test("an item moved to the front moves alone", () => {
  const parent = host();
  const names = signal(["Ada", "Grace", "Katherine", "Mary"]);
  mount(parent, () => <ul>{each(names, (name) => <li>{name}</li>)}</ul>);
  const list = parent.querySelector("ul");
  assert.ok(list);
  const changes = new browser.MutationObserver(() => {});
  changes.observe(list as unknown as Parameters<typeof changes.observe>[0], { childList: true });
  names.set(["Mary", "Ada", "Grace", "Katherine"]);
  const records = changes.takeRecords();
  assert.equal(records.reduce((added, record) => added + record.addedNodes.length, 0), 3, "Mary's markers and item");
  assert.deepEqual(texts(parent), ["Mary", "Ada", "Grace", "Katherine"]);
});

test("if render throws, no row is added or removed, and what the rows built for it started stops", () => {
  const parent = host();
  const names = signal(["Ada"]);
  const volume = signal(1);
  const heard: string[] = [];
  mount(parent, () => (
    <ul>
      {each(names, (name) => {
        if (name === "Broken") throw new Error("a broken row");
        watch(() => heard.push(`${name} ${volume.get()}`));
        return <li>{name}</li>;
      })}
    </ul>
  ));
  assert.throws(() => names.set(["Ada", "Grace", "Broken"]), /a broken row/);
  assert.deepEqual(texts(parent), ["Ada"]);
  volume.set(2);
  assert.deepEqual(heard, ["Ada 1", "Grace 1", "Ada 2"], "Grace's row no longer listens");
  names.set(["Grace", "Ada"]);
  assert.deepEqual(texts(parent), ["Grace", "Ada"], "the list still follows its signal");
});

test("if a gone item's cleanup throws, the list still updates, and the error is rethrown", () => {
  const parent = host();
  const tabs = signal(["Clock", "Settings"]);
  mount(parent, () => (
    <ul>
      {each(tabs, (tab) => {
        if (tab === "Clock") {
          onCleanup(() => {
            throw new Error("the timer was already cleared");
          });
        }
        return <li>{tab}</li>;
      })}
    </ul>
  ));
  assert.throws(() => tabs.set(["Help", "Settings"]), /already cleared/);
  assert.deepEqual(texts(parent), ["Help", "Settings"]);
});

test("a hole in the list is the item undefined, and the list keeps updating after it", () => {
  const parent = host();
  const names = signal<readonly (string | undefined)[]>(["Ada"]);
  mount(parent, () => <ul>{each(names, (name) => <li>{name ?? "nobody"}</li>)}</ul>);
  const sparse: (string | undefined)[] = [];
  sparse[1] = "Grace";
  names.set(sparse);
  assert.deepEqual(texts(parent), ["nobody", "Grace"]);
  names.set(["Hedy"]);
  assert.deepEqual(texts(parent), ["Hedy"]);
});

test("each's rows stop when the HTML around them goes", () => {
  const parent = host();
  const names = signal(["Ada", "Grace"]);
  const active = new Set<string>();
  const unmount = mount(parent, () => (
    <ul>
      {each(names, (name) => {
        active.add(name);
        onCleanup(() => active.delete(name));
        return <li>{name}</li>;
      })}
    </ul>
  ));
  unmount();
  assert.equal(active.size, 0);
  assert.equal(parent.childNodes.length, 0);
  names.set(["Katherine"]);
  assert.equal(active.size, 0, "the list no longer follows its signal");
});

test("each takes a function that reads signals", () => {
  const parent = host();
  const names = signal(["Ada", "Grace", "Katherine"]);
  const query = signal("");
  mount(parent, () => (
    <ul>{each(() => names.get().filter((name) => name.includes(query.get())), (name) => <li>{name}</li>)}</ul>
  ));
  query.set("r");
  assert.deepEqual(texts(parent), ["Grace", "Katherine"]);
});

test("each outside mount says where it belongs", () => {
  assert.throws(() => each(signal(["Ada"]), (name) => name), /mount/);
});
