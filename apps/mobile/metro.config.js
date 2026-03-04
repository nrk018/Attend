const { getDefaultConfig } = require('expo/metro-config');

// Required for expo-router in monorepo - must be set before config loads
process.env.EXPO_ROUTER_APP_ROOT = './app';

const config = getDefaultConfig(__dirname);
module.exports = config;
