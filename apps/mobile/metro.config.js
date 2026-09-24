const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');

// Required for expo-router in monorepo - must be set before config loads
process.env.EXPO_ROUTER_APP_ROOT = process.env.EXPO_ROUTER_APP_ROOT || './app';

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const pickPkg = (pkg) => {
  const nested = path.resolve(projectRoot, 'node_modules', pkg);
  const fallback = path.resolve(monorepoRoot, 'node_modules', pkg);
  return fs.existsSync(nested) ? nested : fallback;
};

const rnHost = pickPkg('react-native');
const polyfillsPath = path.join(rnHost, 'rn-get-polyfills.js');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Prefer the SDK 57 copies nested under apps/mobile. npm 11 also hoists newer
// peerOptional react-native 0.87.x packages to the repo root.
const pinToMobile = [
  'react-native',
  'react-native-gesture-handler',
  'react-native-reanimated',
  'react-native-worklets',
];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  ...Object.fromEntries(pinToMobile.map((pkg) => [pkg, pickPkg(pkg)])),
};

const defaultGetPolyfills = config.serializer?.getPolyfills;
config.serializer = {
  ...config.serializer,
  getPolyfills: (args) => {
    if (fs.existsSync(polyfillsPath)) {
      return require(polyfillsPath)();
    }
    return typeof defaultGetPolyfills === 'function' ? defaultGetPolyfills(args) : [];
  },
};

config.transformer = {
  ...config.transformer,
  unstable_allowRequireContext: true,
};

module.exports = config;
