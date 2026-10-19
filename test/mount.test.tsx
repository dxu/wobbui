import { host } from "./dom.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mount, signal, watch } from "wobbui";

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
