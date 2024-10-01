let exports;

if (typeof require !== 'undefined') {
    // CommonJS environment
    exports = require('./index.cjs');
} else {
    // ES Module environment
    exports = await import('./index.mjs');
}

export default exports;
