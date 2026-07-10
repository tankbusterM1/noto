/*
 * Reanimated 4 compiles its animation callbacks into "worklets" that run on the
 * UI thread. That transform is a Babel plugin, and without this file it never
 * runs — animations silently fall back to the JS thread and stutter under load.
 *
 * `react-native-worklets/plugin` MUST be last in the plugin list.
 * (Reanimated <=3 used 'react-native-reanimated/plugin'; 4.x moved it here.)
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
  };
};
