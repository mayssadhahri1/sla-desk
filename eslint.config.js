// Configuration ESLint (format « flat config ») pour TypeScript
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "coverage"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["public/**/*.js"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["**/*.ts"],
    languageOptions: { globals: globals.node },
    rules: {
      // Les variables préfixées par « _ » sont volontairement ignorées
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
    },
  },
);
