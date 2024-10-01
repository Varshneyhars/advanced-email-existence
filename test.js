let checkEmailExistence, checkMultipleEmails;

(async () => {
    try {
        if (typeof require !== 'undefined') {
            // CommonJS environment
            const moduleExports = require('./index.cjs');
            checkEmailExistence = moduleExports.checkEmailExistence || moduleExports.default;
            checkMultipleEmails = moduleExports.checkMultipleEmails || moduleExports.default;
        } else {
            // ES Module environment
            const module = await import('./index.mjs');
            checkEmailExistence = module.checkEmailExistence || module.default;
            checkMultipleEmails = module.checkMultipleEmails || module.default;
        }

        // Example: Check single email
        console.time('Single Email Check Time');  // Start timing single email check
        const singleEmailResult = await checkEmailExistence('varshney.harshit@outlook.com');
        console.timeEnd('Single Email Check Time');  // End timing and log the result

        const { email, valid, undetermined } = singleEmailResult;

        if (undetermined) {
            console.log(`Email existence for ${email} is undetermined`);
        } else if (valid) {
            console.log(`Email ${email} exists`);
        } else {
            console.log(`Email ${email} does not exist`);
        }

        // Example: Check multiple emails
        const emails = [
            'manaswinisharma.manu@gmail.com',
            '20brapcco06@polygwalior.ac.in',
            'validemail@anotherdomain.com'
        ];

        console.time('Multiple Email Check Time');  // Start timing multiple email check
        const multipleResults = await checkMultipleEmails(emails);
        console.timeEnd('Multiple Email Check Time');  // End timing and log the result

        multipleResults.forEach(({ email, valid, undetermined }) => {
            if (undetermined) {
                console.log(`Email existence for ${email} is undetermined`);
            } else if (valid) {
                console.log(`Email ${email} exists`);
            } else {
                console.log(`Email ${email} does not exist`);
            }
        });

    } catch (err) {
        console.error('Error checking email existence:', err);
    }
})();
