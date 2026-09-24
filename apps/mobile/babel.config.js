module.exports = function (api) {
  api.cache.using(() => process.env.EXPO_ROUTER_APP_ROOT || './app');
  return {
    presets: ['babel-preset-expo'],
    // NOTE: react-native-reanimated/plugin is automatically included by babel-preset-expo in SDK 54+
    // Do NOT add it manually or it will cause duplicate plugin conflicts
  };
};
