import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

// Node cannot resolve the project's "@/..." TypeScript path alias on its own.
// The check scripts import application modules directly (the same trick
// scripts/check-onshape-integration.mjs uses for relative imports), so map the
// alias onto ./src here rather than rewriting the app to relative paths.
const srcRoot = path.resolve(process.cwd(), "src");
const EXTENSIONS = ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts"];

function resolveAliased(specifier) {
  const base = path.join(srcRoot, specifier.slice(2));
  for (const extension of EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const resolved = resolveAliased(specifier);
      if (resolved) {
        return { url: pathToFileURL(resolved).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});
