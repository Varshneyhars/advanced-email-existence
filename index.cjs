// CommonJS syntax
const dns = require('dns/promises');
const net = require('net');

// Constants
const MAX_EMAIL_LEN = 300;
const CONNECTION_TIMEOUT = 5000;
const MAX_PARALLEL_CONNECTIONS = 10;

const mxCache = new Map();

async function getPLimit() {
    const { default: pLimit } = await import('p-limit'); // Dynamically import p-limit
    return pLimit(MAX_PARALLEL_CONNECTIONS);
}

// Function to resolve MX records with caching
async function resolveMxCached(domain) {
    if (mxCache.has(domain)) return mxCache.get(domain);
    try {
        const addresses = (await dns.resolveMx(domain)).sort((a, b) => a.priority - b.priority);
        mxCache.set(domain, addresses);
        return addresses;
    } catch (err) {
        mxCache.set(domain, null);
        return null;
    }
}

// Function to check email existence
async function checkEmailExistence(email, timeout = CONNECTION_TIMEOUT, fromEmail = email) {
    const limit = await getPLimit(); // Get the limit instance
    if (email.length > MAX_EMAIL_LEN || !/^\S+@\S+$/.test(email)) {
        return { email, valid: false, undetermined: false };
    }
    const domain = email.split('@')[1];
    const addresses = await resolveMxCached(domain);
    if (!addresses) {
        return { email, valid: false, undetermined: false };
    }
    const checkPromises = addresses.map(({ exchange }) =>
        limit(() => checkMXServer(exchange, email, fromEmail, timeout))
    );
    try {
        const result = await Promise.race(checkPromises);
        return { email, ...result };
    } catch (err) {
        return { email, valid: false, undetermined: true };
    }
}

// Function to check MX server
async function checkMXServer(mxHost, email, fromEmail, timeout) {
    const commands = [`helo ${mxHost}`, `mail from: <${fromEmail}>`, `rcpt to: <${email}>`];
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
                    response = true;
                    conn.end();
                }
            } else if (/^550/.test(data)) {
                response = false;
                conn.end();
            } else {
                conn.end();
            }
        });

        conn.on('error', (err) => {
            conn.destroy();
            reject(new Error(`Connection error with ${mxHost}: ${err.message}`));
        });

        conn.on('timeout', () => {
            conn.destroy();
            reject(new Error(`Connection timeout with ${mxHost}`));
        });

        conn.on('end', () => {
            resolve({ valid: response, undetermined: !response });
        });
    });
}

// Function to check multiple emails
async function checkMultipleEmails(emails, timeout = CONNECTION_TIMEOUT, fromEmail) {
    const limit = await getPLimit(); // Get the limit instance
    const results = await Promise.allSettled(
        emails.map((email) => limit(() => checkEmailExistence(email, timeout, fromEmail)))
    );
    return results.map((result) => 
        result.status === 'fulfilled' ? result.value : { email: result.reason.email, valid: false, undetermined: true }
    );
}

// Export functions
module.exports = { checkEmailExistence, checkMultipleEmails };
