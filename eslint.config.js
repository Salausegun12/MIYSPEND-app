// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
    rules: {
      // These React Compiler rules fire on long-standing React Native patterns
      // this app relies on (Animated.Value refs, lazy "register once" refs and
      // data-loading effects). The app does not enable the compiler, so they are
      // advisory here rather than build-breaking.
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
    },
  },
]);
