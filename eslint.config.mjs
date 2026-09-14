import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: ["node_modules", "out", "dist", ".vite"]
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "TryStatement",
          message: "Model failures with Effect error channels instead of try/catch."
        }
      ]
    }
  }
)
