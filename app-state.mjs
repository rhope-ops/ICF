// The app's shared mutable state: one object, `shared`, that every app module reads and writes.
// Why one object: an ES module cannot assign another module's top-level variable, so the variables that the screens
// share live here as fields. app.mjs gives each field its start value, next to the comment that says what it holds;
// the modules then change them.
// Inputs: none. Outputs: the `shared` object. Run: loaded by the browser as part of the app (site/dist/index.html).
// Network: none. Writes: none (saved data is written through persist() in app.mjs). Credentials: none.
export const shared = {};
