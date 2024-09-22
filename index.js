// Dynamic imports for CommonJS and ES Module compatibility
let dns, net, pLimit;

if (typeof require !== 'undefined') {
    // CommonJS environment
    dns = require('dns/promises');
    net = require('net');
    pLimit = require('p-limit');
} else {
    // ES Module environment (using dynamic imports)
    dns = (await import('dns/promises')).default;
    net = (await import('net')).default;
    pLimit = (await import('p-limit')).default;
}

const MAX_EMAIL_LEN = 300;
const CONNECTION_TIMEOUT = 5000; // Timeout for faster response
const MAX_PARALLEL_CONNECTIONS = 10; // Limit parallel connections to prevent network overload

// Use p-limit to control concurrency
const limit = pLimit(MAX_PARALLEL_CONNECTIONS);

// Cache MX records to reduce redundant lookups for the same domain
const mxCache = new Map();

async function resolveMxCached(domain) {
    if (mxCache.has(domain)) return mxCache.get(domain);

    try {
        const addresses = (await dns.resolveMx(domain)).sort((a, b) => a.priority - b.priority);
        mxCache.set(domain, addresses);
        return addresses;
    } catch (err) {
        mxCache.set(domain, null); // Cache failed results to prevent repeated lookups
        return null;
    }
}

async function checkEmailExistence(email, timeout = CONNECTION_TIMEOUT, fromEmail = email) {
    // Validate email format and length
    if (email.length > MAX_EMAIL_LEN || !/^\S+@\S+$/.test(email)) {
        return { email, valid: false, undetermined: false };
    }

    const domain = email.split('@')[1];
    const addresses = await resolveMxCached(domain);

    if (!addresses) {
        return { email, valid: false, undetermined: false };
    }

    // Check each MX server with concurrency control
    const checkPromises = addresses.map(({ exchange }) =>
        limit(() => checkMXServer(exchange, email, fromEmail, timeout))
    );

    // Use Promise.race to return as soon as the first valid result is received
    try {
        const result = await Promise.race(checkPromises);
        return { email, ...result };
    } catch (err) {
        return { email, valid: false, undetermined: true };
    }
}

async function checkMXServer(mxHost, email, fromEmail, timeout) {
    const commands = [
        `helo ${mxHost}`,
        `mail from: <${fromEmail}>`,
        `rcpt to: <${email}>`
    ];

    return new Promise((resolve, reject) => {
        const port = 25;

        const conn = net.createConnection({ host: mxHost, port });
        conn.setEncoding('ascii');
        conn.setTimeout(timeout);

        let i = 0;
        let response = false;

        conn.on('data', (data) => {
            if (/^220|^250/.test(data)) {
                if (i < commands.length) {
                    conn.write(commands[i] + '\r\n');
                    i++;
                } else {
                    response = true; // Email is valid
                    conn.end();
                }
            } else if (/^550/.test(data)) {
                response = false; // Email doesn't exist
                conn.end();
            } else {
                conn.end();
            }
        });

        conn.on('error', () => {
            conn.destroy();
            reject(); // Treat as undetermined
        });

        conn.on('timeout', () => {
            conn.destroy();
            reject(); // Treat as undetermined
        });

        conn.on('end', () => {
            resolve({ valid: response, undetermined: !response });
        });
    });
}

// Function to check multiple emails with parallelism
async function checkMultipleEmails(emails, timeout = CONNECTION_TIMEOUT, fromEmail) {
    const results = await Promise.allSettled(
        emails.map(email =>
            limit(() => checkEmailExistence(email, timeout, fromEmail))
        )
    );

    return results.map(result => result.status === 'fulfilled' ? result.value : { email: result.reason, valid: false, undetermined: true });
}

// For CommonJS compatibility, use module.exports
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = { checkEmailExistence, checkMultipleEmails };
}

// Export for ES Module
export { checkEmailExistence, checkMultipleEmails };
