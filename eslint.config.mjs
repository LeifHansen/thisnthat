import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The Expo app lints itself (`cd mobile && npm run lint`); the Next.js
    // config's rules/aliases don't apply to React Native code.
    "mobile/**",
  ]),
  // Root Node scripts are CommonJS (run by node in the Docker image / setup),
  // so require() is correct there.
  {
    files: ["docker-entrypoint.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
