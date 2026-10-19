import { fire, host } from "./dom.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mount } from "wobbui";

test("JSX builds real elements, with their properties, attributes and children", () => {
  const parent = host();
  mount(parent, () => (
    <main className="p-8" data-page="menu" aria-label="Main menu">
      <h1>Menu</h1>
      <a href="/settings">Settings</a>
    </main>
  ));
  const main = parent.querySelector("main");
  assert.ok(main);
  assert.equal(main.className, "p-8");
  assert.equal(main.getAttribute("data-page"), "menu");
  assert.equal(main.getAttribute("aria-label"), "Main menu");
  assert.equal(main.querySelector("h1")?.textContent, "Menu");
  assert.equal(main.querySelector("a")?.getAttribute("href"), "/settings");
});

test("a text property takes a number, and style takes text", () => {
  const parent = host();
  mount(parent, () => <input type="number" min={0} max={10} step={0.5} style="width: 8rem" />);
  const input = parent.querySelector("input");
  assert.ok(input);
  assert.equal(input.min, "0");
  assert.equal(input.max, "10");
  assert.equal(input.step, "0.5");
  assert.equal(input.style.width, "8rem");
});

test("a select's value is set once its options are in it", () => {
  const parent = host();
  mount(parent, () => (
    <select value="medium">
      <option value="low">Low</option>
      <option value="medium">Medium</option>
      <option value="high">High</option>
    </select>
  ));
  assert.equal(parent.querySelector("select")?.value, "medium");
});

test("a range input's value is set after its min and max, wherever it's written", () => {
  const parent = host();
  mount(parent, () => <input type="range" value={150} min={0} max={200} />);
  assert.equal(parent.querySelector("input")?.value, "150");
});

test("an event handler gets its element as currentTarget", () => {
  const parent = host();
  let typed = "";
  mount(parent, () => <input oninput={(event) => (typed = event.currentTarget.value)} />);
  const input = parent.querySelector("input");
  assert.ok(input);
  input.value = "hello";
  fire(input, "input");
  assert.equal(typed, "hello");
});

test("ref gets the element once it's built, children included", () => {
  const parent = host();
  let items = -1;
  mount(parent, () => (
    <ul ref={(list) => (items = list.children.length)}>
      <li>One</li>
      <li>Two</li>
    </ul>
  ));
  assert.equal(items, 2);
});

test("a fragment adds its children with nothing around them", () => {
  const parent = host();
  mount(parent, () => (
    <>
      <h1>Title</h1>
      <p>Text</p>
    </>
  ));
  assert.deepEqual(
    [...parent.children].map((child) => child.tagName),
    ["H1", "P"],
  );
});

test("a component is a function of its props, run once", () => {
  const parent = host();
  let runs = 0;
  function Greeting(props: { name: string }) {
    runs++;
    return <p>Hello, {props.name}</p>;
  }
  mount(parent, () => <Greeting name="Ada" />);
  assert.equal(parent.textContent, "Hello, Ada");
  assert.equal(runs, 1);
});

test("true, false, null and undefined add nothing; numbers add text; arrays add each item", () => {
  const parent = host();
  const items = ["a", "b"];
  mount(parent, () => (
    <p>
      {true}
      {false}
      {null}
      {undefined}
      {3}
      {items.map((item) => (
        <b>{item}</b>
      ))}
    </p>
  ));
  assert.equal(parent.querySelector("p")?.innerHTML, "3<b>a</b><b>b</b>");
});
