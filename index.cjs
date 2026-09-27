// CommonJS implementation. index.mjs re-exports this file so both entry
// points always share one implementation.
const dns = require('dns/promises');
const net = require('net');

const MAX_EMAIL_LEN = 300;
const CONNECTION_TIMEOUT = 5000;
const MAX_PARALLEL_CONNECTIONS = 10;
const MAX_PARALLEL_EMAILS = 10;
const SMTP_PORT = 25;

// DNS error codes that mean the domain definitively cannot receive mail.
const PERMANENT_DNS_ERRORS = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN']);

const INVALID = { valid: false, undetermined: false };
const UNDETERMINED = { valid: false, undetermined: true };
const VALID = { valid: true, undetermined: false };

const mxCache = new Map();

// p-limit is ESM-only, so it is imported dynamically. The promise is memoised
// so every call shares one pair of limiters — creating them per call would
// leave the concurrency caps unenforced.
let limitersPromise;
function getLimiters() {
    if (!limitersPromise) {
        limitersPromise = import('p-limit').then(({ default: pLimit }) => ({
            // Separate pools: an email check holds an `email` slot while it
            // waits for `connection` slots. Sharing one pool would deadlock.
            connection: pLimit(MAX_PARALLEL_CONNECTIONS),
            email: pLimit(MAX_PARALLEL_EMAILS),
        }));
    }
    return limitersPromise;
}

async function resolveMxCached(domain) {
    if (mxCache.has(domain)) return mxCache.get(domain);
    try {
        const addresses = (await dns.resolveMx(domain))
            .filter(({ exchange }) => exchange)
            .sort((a, b) => a.priority - b.priority);
        if (addresses.length === 0) {
            mxCache.set(domain, null);
            return null;
        }
        mxCache.set(domain, addresses);
        return addresses;
    } catch (err) {
        if (PERMANENT_DNS_ERRORS.has(err.code)) {
            mxCache.set(domain, null);
            return null;
        }
        // Transient failure (SERVFAIL, TIMEOUT, ...) — don't cache it, and
        // don't claim the address is invalid.
        throw err;
    }
}

/**
 * Resolves as soon as any host returns a definitive answer. If every host is
 * inconclusive or fails, the result is undetermined rather than invalid.
 */
function firstDefinitive(tasks) {
    return new Promise((resolve) => {
        let pending = tasks.length;
        let settled = false;
        let fallback = UNDETERMINED;

        for (const task of tasks) {
            task().then(
                (result) => {
                    if (settled) return;
                    if (!result.undetermined) {
                        settled = true;
                        resolve(result);
                        return;
                    }
                    if (--pending === 0) resolve(fallback);
                },
                () => {
                    if (settled) return;
                    if (--pending === 0) resolve(fallback);
                }
            );
        }

        if (tasks.length === 0) resolve(fallback);
    });
}

async function checkEmailExistence(email, timeout = CONNECTION_TIMEOUT, fromEmail = email) {
    if (typeof email !== 'string' || email.length > MAX_EMAIL_LEN || !/^\S+@\S+\.\S+$/.test(email)) {
        return { email, ...INVALID };
    }

    const domain = email.split('@').pop();
    let addresses;
    try {
        addresses = await resolveMxCached(domain);
    } catch (err) {
        return { email, ...UNDETERMINED };
    }
    if (!addresses) {
        return { email, ...INVALID };
    }

    const { connection } = await getLimiters();
    const result = await firstDefinitive(
        addresses.map(({ exchange }) => () =>
            connection(() => checkMXServer(exchange, email, fromEmail, timeout))
        )
    );
    return { email, ...result };
}

/**
 * Opens an SMTP session and reads the reply to `RCPT TO`.
 * - 2xx on RCPT TO  -> valid
 * - 550/551/553 etc. on RCPT TO -> invalid (mailbox does not exist)
 * - 4xx, greylisting, blocklisting, socket errors -> undetermined
 */
function checkMXServer(mxHost, email, fromEmail, timeout, port = SMTP_PORT) {
    return new Promise((resolve, reject) => {
        const commands = [
            `HELO ${mxHost}`,
            `MAIL FROM: <${fromEmail}>`,
            `RCPT TO: <${email}>`,
        ];

        const conn = net.createConnection({ host: mxHost, port });
        conn.setEncoding('ascii');
        conn.setTimeout(timeout);

        let buffer = '';
        let sent = 0;        // commands written so far
        let outcome = null;  // decided result, reported on close
        let settled = false;

        const finish = (result) => {
            if (settled) return;
            settled = true;
            outcome = result;
            // Be polite before hanging up; ignore errors on a dying socket.
            try {
                conn.write('QUIT\r\n');
            } catch {}
            conn.end();
        };

        const fail = (message) => {
            if (settled) return;
            settled = true;
            conn.destroy();
            reject(new Error(message));
        };

        conn.on('data', (chunk) => {
            buffer += chunk;

            // SMTP replies are CRLF-delimited; "250-foo" is a continuation
            // line and "250 foo" terminates the reply. Only act on complete
            // replies so a split or multi-line chunk can't be misread.
            let index;
            while ((index = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, index).replace(/\r$/, '');
                buffer = buffer.slice(index + 1);

                const match = /^(\d{3})([ -])/.exec(line);
                if (!match) continue;
                const [, codeText, separator] = match;
                if (separator === '-') continue; // not the final line yet

                const code = Number(codeText);
                const awaitingReplyFor = sent - 1; // -1 => server greeting
                const isRcptReply = awaitingReplyFor === 2;

                if (code >= 400 && code < 500) {
                    // Temporary failure / greylisting — nothing learned.
                    finish(UNDETERMINED);
                    return;
                }

                if (code >= 500) {
                    // Blocklisting tells us about our IP, not the mailbox.
                    if (/spamhaus|blocked|blacklist|access denied|rejected due to/i.test(line)) {
                        fail(`Client host blocked by ${mxHost}: ${line}`);
                        return;
                    }
                    finish(isRcptReply ? INVALID : UNDETERMINED);
                    return;
                }

                if (code >= 200 && code < 400) {
                    if (isRcptReply) {
                        finish(VALID);
                        return;
                    }
                    if (sent < commands.length) {
                        conn.write(commands[sent] + '\r\n');
                        sent++;
                        continue;
                    }
                    finish(UNDETERMINED);
                    return;
                }

                finish(UNDETERMINED);
                return;
            }
        });

        conn.on('error', (err) => fail(`Connection error with ${mxHost}: ${err.message}`));
        conn.on('timeout', () => fail(`Connection timeout with ${mxHost}`));

        conn.on('close', () => {
            if (outcome) resolve(outcome);
            else fail(`Connection closed by ${mxHost} before a verdict`);
        });
    });
}

async function checkMultipleEmails(emails, timeout = CONNECTION_TIMEOUT, fromEmail) {
    const { email: emailLimit } = await getLimiters();
    const results = await Promise.allSettled(
        emails.map((address) => emailLimit(() => checkEmailExistence(address, timeout, fromEmail)))
    );
    return results.map((result, i) =>
        result.status === 'fulfilled' ? result.value : { email: emails[i], ...UNDETERMINED }
    );
}

module.exports = { checkEmailExistence, checkMultipleEmails };

// Internals exposed for the test suite only; not part of the public API.
module.exports.__test__ = { checkMXServer, resolveMxCached, mxCache };
