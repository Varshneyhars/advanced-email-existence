// CommonJS syntax
const dns = require('dns/promises');
const net = require('net');
const { default: pLimit } = require('p-limit'); 

// Constants
const MAX_EMAIL_LEN = 300;
const CONNECTION_TIMEOUT = 5000;
const MAX_PARALLEL_CONNECTIONS = 5; 
const RETRY_DELAY_BASE = 1000;
const MAX_RETRY_ATTEMPTS = 3; 

const mxCache = new Map();
const limit = pLimit(MAX_PARALLEL_CONNECTIONS);

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
async function checkEmailExistence(email, timeout = CONNECTION_TIMEOUT, fromEmail = 'your-dedicated-email@yourdomain.com') { 
    if (email.length > MAX_EMAIL_LEN || !/^\S+@\S+$/.test(email)) {
        return { email, valid: false, undetermined: false };
    }
    const domain = email.split('@')[1];
    const addresses = await resolveMxCached(domain);
    if (!addresses) {
        return { email, valid: false, undetermined: false };
    }
    const checkPromises = addresses.map(({ exchange }) =>
        limit(() => checkMXServer(exchange, email, fromEmail, timeout, 0)) 
    );
    try {
        const result = await Promise.race(checkPromises);
        return { email, ...result };
    } catch (err) {
        return { email, valid: false, undetermined: true };
    }
}

// Function to check MX server with retry logic
async function checkMXServer(mxHost, email, fromEmail, timeout, retryCount) {
    const commands = [
        `EHLO google.com`,  // Use your actual domain here
        `MAIL FROM: <${fromEmail}>`, 
        `RCPT TO: <${email}>`
    ];

    return new Promise((resolve, reject) => {
        const port = 25;
        const conn = net.createConnection({ host: mxHost, port });
        conn.setEncoding('ascii');
        conn.setTimeout(timeout);
        let i = 0;
        let response = false;

        conn.on('data', (data) => {
            console.log(`Received: ${data}`); 
            if (/^220|^250/.test(data)) {  
                if (i < commands.length) {
                    conn.write(commands[i] + '\r\n');
                    i++;
                } else {
                    response = true;  
                    conn.end();
                }
            } else if (/^550/.test(data)) {  
                if (/blocked using Spamhaus/.test(data)) {
                    reject(new Error('Client host is blocked (Spamhaus)'));
                } else {
                    response = false;
                    conn.end();
                }
            } else if (/^421|^450|^451/.test(data)) {  
                conn.end();
                if (retryCount < MAX_RETRY_ATTEMPTS) {
                    const delay = RETRY_DELAY_BASE * (2 ** retryCount) + Math.random() * 1000;
                    setTimeout(() => {
                        checkMXServer(mxHost, email, fromEmail, timeout, retryCount + 1)
                            .then(resolve)
                            .catch(reject);
                    }, delay);
                } else {
                    reject(new Error(`Retry limit exceeded for ${mxHost}`)); 
                }
            } else {
                console.log(`Unexpected response: ${data}`);
                conn.end(); 
            }
        });

        conn.on('error', (err) => {
            conn.destroy();
            if ((err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT')) && retryCount < MAX_RETRY_ATTEMPTS) {
                const delay = RETRY_DELAY_BASE * (2 ** retryCount) + Math.random() * 1000;
                setTimeout(() => {
                    checkMXServer(mxHost, email, fromEmail, timeout, retryCount + 1)
                        .then(resolve)
                        .catch(reject);
                }, delay);
            } else {
                reject(new Error(`Connection error with ${mxHost}: ${err.message}`));
            }
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
    const results = await Promise.allSettled(
        emails.map((email) => limit(() => checkEmailExistence(email, timeout, fromEmail)))
    );
    return results.map((result) => 
        result.status === 'fulfilled' ? result.value : { email: result.reason.email, valid: false, undetermined: true }
    );
}

// Export functions
module.exports = { checkEmailExistence, checkMultipleEmails };