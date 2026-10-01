import eslint from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import globals from "globals";
import tseslint from "typescript-eslint";

const declarations = [
  "function",
  "class",
  "interface",
  "type",
  "export",
  // Include functions/classes assigned to variables, without spacing every const.
  ...["ArrowFunctionExpression", "FunctionExpression", "ClassExpression"].map((type) => ({
    selector: `VariableDeclaration:has(> VariableDeclarator[init.type="${type}"])`,
  })),
];

export default [
  {
    ...eslint.configs.recommended,
    files: ["src/**/*.ts", "scripts/**/*.mjs", "tests/**/*.ts"],
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["src/**/*.ts", "tests/**/*.ts"],
  })),
  {
    files: ["src/**/*.ts", "scripts/**/*.mjs", "tests/**/*.ts"],
    plugins: { "@stylistic": stylistic },
    rules: {
      "@stylistic/padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: "*", next: declarations },
        { blankLine: "always", prev: declarations, next: "*" },
      ],
      "@stylistic/lines-between-class-members": ["error", "always"],
    },
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ["scripts/**/*.mjs", "tests/**/*.ts"],
    languageOptions: { globals: globals.node },
  },
];
