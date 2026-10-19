// wobbui with its warnings on: the build bundlers pick while developing, through package.json's "development" export
// condition. It's the same module as the plain build, so JSX and the API share one copy of wobbui's state.
import { setWarnings } from "./index.js";

setWarnings(true);

export * from "./index.js";
