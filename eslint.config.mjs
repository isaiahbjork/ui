import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // React Compiler rules (react-hooks v7). 52 legacy hits across 33 files; keep them visible but non-blocking.
    // New components are linted with --max-warnings 0, so they must be clean.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "public/**", "next-env.d.ts", "research/**", ".playwright-mcp/**", "node_modules/**"]),
]);
