const webpack = require('webpack');
const path = require('path');

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
    };

    return config;
}
