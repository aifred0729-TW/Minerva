const webpack = require('webpack');
const path = require('path');
const ForkTsCheckerWebpackPlugin = require('react-dev-utils/ForkTsCheckerWebpackPlugin');

module.exports = function override(config, env) {
    config.resolve.alias = {
        ...config.resolve.alias,
        '@': path.resolve(__dirname, 'src/Minerva'),
    };
    config.resolve.extensions = [...config.resolve.extensions, '.ts', '.tsx'];
    config.resolve.fallback = {
        //url: require.resolve('url'),
        fs: false,
        assert: require.resolve('assert'),
        crypto: require.resolve('crypto-browserify'),
        path: require.resolve('path-browserify'),
        //http: require.resolve('stream-http'),
        //https: require.resolve('https-browserify'),
        //os: require.resolve('os-browserify/browser'),
        //buffer: require.resolve('buffer'),
        stream: require.resolve('stream-browserify'),
        vm: false,
    };

    // Disable TypeScript type-checking overlay — TS errors are non-blocking
    // and the overlay prevents using the app during development
    config.plugins = config.plugins.filter(
        plugin => !(plugin instanceof ForkTsCheckerWebpackPlugin)
    );

    return config;
}
