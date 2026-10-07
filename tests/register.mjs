// Test bootstrap: lets `node --test` import the app's TypeScript sources
// directly. Resolves the `@/` path alias (tsconfig "paths") and extensionless
// relative imports, and transpiles .ts/.tsx with the project's own `typescript`
// package — no extra test dependencies.
import { register } from 'node:module';

register('./ts-loader.mjs', import.meta.url);
