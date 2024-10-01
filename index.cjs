// CommonJS syntax
const dns = require('dns/promises');
const net = require('net');
const pLimit = require('p-limit');

const MAX_EMAIL_LEN = 300;
const CONNECTION_TIMEOUT = 5000;
const MAX_PARALLEL_CONNECTIONS = 10;

const limit = pLimit(MAX_PARALLEL_CONNECTIONS);

const mxCache = new Map();

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

async function checkEmailExistence(email, timeout = CONNECTION_TIMEOUT, fromEmail = email) {
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
        conn.on('error', () => {
            conn.destroy();
            reject();
        });
        conn.on('timeout', () => {
            conn.destroy();
            reject();
        });
        conn.on('end', () => {
            resolve({ valid: response, undetermined: !response });
        });
    });
}

async function checkMultipleEmails(emails, timeout = CONNECTION_TIMEOUT, fromEmail) {
    const results = await Promise.allSettled(
        emails.map((email) => limit(() => checkEmailExistence(email, timeout, fromEmail)))
    );
    return results.map((result) => (result.status === 'fulfilled' ? result.value : { email: result.reason, valid: false, undetermined: true }));
}

module.exports = { checkEmailExistence, checkMultipleEmails };
