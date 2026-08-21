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
        // Nothing under src/ imports node's crypto/path/stream — verified by
        // grep. The only consumer is sql.js, whose browser/wasm build guards
        // these behind `typeof require`, so polyfilling them shipped ~1.45 MB of
        // Node shims into the sql.js chunk for nothing (1,534,952 B -> ~80 KB).
        crypto: false,
        path: false,
        //http: require.resolve('stream-http'),
        //https: require.resolve('https-browserify'),
        //os: require.resolve('os-browserify/browser'),
        //buffer: require.resolve('buffer'),
        stream: false,
        vm: false,
    };

    // Disable TypeScript type-checking overlay — TS errors are non-blocking
    // and the overlay prevents using the app during development
    config.plugins = config.plugins.filter(
        plugin => !(plugin instanceof ForkTsCheckerWebpackPlugin)
    );

    return config;
}
