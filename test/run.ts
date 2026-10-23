// Runs the built tests, each file in a process of its own as `node --test` does, and ends all of those processes when
// the run takes too long or is stopped. `node --test` alone doesn't: killing it, or its `--test-timeout`, leaves the
// processes it started for the test files running, and one stuck printing a happy-dom element grew to ~195 GB. So the
// run gets a process group of its own, and the whole group is ended. Given test files, it runs only those.
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

/** How long a whole run may take. It takes about 2 seconds. */
const LIMIT_MS = 60_000;

const files =
  process.argv.length > 2
    ? process.argv.slice(2)
    : readdirSync(import.meta.dirname)
        .filter((name) => name.endsWith(".test.js"))
        .map((name) => join(import.meta.dirname, name));
const run = spawn(process.execPath, ["--test", ...files], { stdio: "inherit", detached: true });
let ending = false;

/** Sends `signal` to every process left in the run's group. Returns whether any was left. */
function signalAll(signal: NodeJS.Signals | 0): boolean {
  // Without an id there's no group, and a group id of 0 would mean this process's own.
  if (run.pid === undefined) return false;
  try {
    process.kill(-run.pid, signal);
    return true;
  } catch {
    return false;
  }
}

/** Ends every process in the run, gently and then for good, once, and fails the run. */
function endAll(why: string): void {
  if (ending) return;
  ending = true;
  process.exitCode = 1;
  console.error(`wobbui tests: ${why}, so every process they started is being ended.`);
  signalAll("SIGTERM");
  setTimeout(() => {
    signalAll("SIGKILL");
    if (signalAll(0)) console.error(`wobbui tests: processes in group ${run.pid} are still running; end them by hand.`);
  }, 1000);
}

const limit = setTimeout(() => endAll(`still running after ${LIMIT_MS / 1000} s`), LIMIT_MS);
// Ctrl-C reaches only the terminal's process group, which the run has left, so a signal that stops this is passed on,
// as is an alarm from a wrapper that limits time. A process killed outright can't pass anything on: look for its tests
// afterwards with `pgrep -fl '\.test\.'`.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGALRM"] as const) {
  process.on(signal, () => endAll(`stopped by ${signal}`));
}
run.on("exit", (code) => {
  clearTimeout(limit);
  if (!ending) process.exitCode = code ?? 1;
  // A test that started a process of its own may have left it running.
  if (signalAll(0)) endAll("they ended but left processes running");
});
