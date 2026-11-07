// EXPO_BASE_URL is set only for the GitHub Pages build (the site lives under /<repo-name>/). Netlify and local runs leave it empty.
const baseUrl = process.env.EXPO_BASE_URL || undefined;
module.exports = {
  expo: {
    name: 'Unibuild', slug: 'unibuild', scheme: 'unibuild', version: '0.1.0',
    orientation: 'default', userInterfaceStyle: 'automatic', plugins: [['expo-router', { asyncRoutes: { web: true, default: false } }]],
    android: { package: 'com.unibuild.app' }, ios: { bundleIdentifier: 'com.unibuild.app' },
    web: { bundler: 'metro' },
    experiments: baseUrl ? { baseUrl } : {},
  },
};
