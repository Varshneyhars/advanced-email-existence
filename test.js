import checkEmailExistence from './index.js';

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
