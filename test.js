// Check if running in CommonJS or ES Module environment
let checkEmailExistence;

try {
    // Try ES module dynamic import
    checkEmailExistence = (await import('./index.js')).default;
} catch (e) {
    // Fallback to CommonJS if ES module import fails
    checkEmailExistence = require('./index.js');
}

(async () => {
    try {
        const { valid, undetermined } = await checkEmailExistence('manaswinisharma.manu@gmail.com');

        if (undetermined) {
            console.log('Email existence is undetermined');
        } else if (valid) {
            console.log('Email exists');
        } else {
            console.log('Email does not exist');
        }
    } catch (err) {
        console.error('Error checking email existence:', err);
    }
})();
