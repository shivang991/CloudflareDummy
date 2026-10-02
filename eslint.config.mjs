import eslint from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import globals from "globals";
import tseslint from "typescript-eslint";
import vue from "eslint-plugin-vue";

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
    ignores: [
      "dist/**",
      "node_modules/**",
      ".wrangler/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  {
    ...eslint.configs.recommended,
    files: ["src/**/*.ts", "frontend/**/*.ts", "scripts/**/*.mjs", "tests/**/*.ts", "*.config.ts"],
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["src/**/*.ts", "frontend/**/*.ts", "tests/**/*.ts", "*.config.ts"],
  })),
  ...vue.configs["flat/essential"],
  {
    files: ["frontend/**/*.vue"],
    languageOptions: { parserOptions: { parser: tseslint.parser }, globals: globals.browser },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "vue/multi-word-component-names": "off",
      "@typescript-eslint/no-unused-vars": "error",
    },
  },
  {
    files: ["frontend/**/*.ts"],
    languageOptions: { globals: globals.browser },
  },
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
    files: ["scripts/**/*.mjs", "tests/**/*.ts", "*.config.ts"],
    languageOptions: { globals: globals.node },
  },
];
