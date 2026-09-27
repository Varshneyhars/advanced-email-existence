// Offline test suite: spins up fake SMTP servers so protocol handling is
// verified deterministically, with no network access and no real mailboxes.
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');

const { checkEmailExistence, checkMultipleEmails, __test__ } = require('./index.cjs');
const { checkMXServer } = __test__;

/**
 * Starts a fake SMTP server. `script` maps the command it receives to the
 * raw reply it sends back.
 */
function fakeSmtp(script) {
    const server = net.createServer((socket) => {
        socket.setEncoding('ascii');
        socket.write(script.greeting ?? '220 fake.test ESMTP ready\r\n');
        let buffer = '';
        socket.on('data', (chunk) => {
            buffer += chunk;
            let i;
            while ((i = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, i).replace(/\r$/, '');
                buffer = buffer.slice(i + 1);
                const verb = line.split(/[\s:]/)[0].toUpperCase();
                if (verb === 'QUIT') {
                    socket.end('221 bye\r\n');
                    return;
                }
                const reply = script[verb];
                if (reply) socket.write(reply);
            }
        });
        socket.on('error', () => {});
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve({
            server,
            port: server.address().port,
            close: () => new Promise((r) => server.close(r)),
        }));
    });
}

const OK = {
    HELO: '250 hello\r\n',
    MAIL: '250 sender ok\r\n',
    RCPT: '250 recipient ok\r\n',
};

test('accepted RCPT TO reports the address as valid', async () => {
    const s = await fakeSmtp(OK);
    try {
        const r = await checkMXServer('127.0.0.1', 'a@b.test', 'a@b.test', 2000, s.port);
        assert.deepEqual(r, { valid: true, undetermined: false });
    } finally { await s.close(); }
});

test('550 on RCPT TO is invalid, not undetermined', async () => {
    const s = await fakeSmtp({ ...OK, RCPT: '550 5.1.1 No such user here\r\n' });
    try {
        const r = await checkMXServer('127.0.0.1', 'a@b.test', 'a@b.test', 2000, s.port);
        assert.deepEqual(r, { valid: false, undetermined: false },
            'a definitive rejection must not be reported as undetermined');
    } finally { await s.close(); }
});

test('4xx greylisting is undetermined', async () => {
    const s = await fakeSmtp({ ...OK, RCPT: '451 4.7.1 Greylisted, try again later\r\n' });
    try {
        const r = await checkMXServer('127.0.0.1', 'a@b.test', 'a@b.test', 2000, s.port);
        assert.deepEqual(r, { valid: false, undetermined: true });
    } finally { await s.close(); }
});

test('multi-line 250 replies are parsed as one reply', async () => {
    const s = await fakeSmtp({
        greeting: '220-fake.test greeting line one\r\n220 fake.test ready\r\n',
        HELO: '250-PIPELINING\r\n250-SIZE 10240000\r\n250-STARTTLS\r\n250 HELP\r\n',
        MAIL: '250 sender ok\r\n',
        RCPT: '250 recipient ok\r\n',
    });
    try {
        const r = await checkMXServer('127.0.0.1', 'a@b.test', 'a@b.test', 2000, s.port);
        assert.deepEqual(r, { valid: true, undetermined: false },
            'continuation lines (250-) must not be treated as final replies');
    } finally { await s.close(); }
});

test('blocklisting our IP rejects rather than claiming the mailbox is absent', async () => {
    const s = await fakeSmtp({ ...OK, RCPT: '550 Blocked using Spamhaus\r\n' });
    try {
        await assert.rejects(
            () => checkMXServer('127.0.0.1', 'a@b.test', 'a@b.test', 2000, s.port),
            /blocked/i
        );
    } finally { await s.close(); }
});

test('550 on MAIL FROM is undetermined, not a verdict on the recipient', async () => {
    const s = await fakeSmtp({ ...OK, MAIL: '550 5.7.1 Sender not allowed\r\n' });
    try {
        const r = await checkMXServer('127.0.0.1', 'a@b.test', 'a@b.test', 2000, s.port);
        assert.deepEqual(r, { valid: false, undetermined: true });
    } finally { await s.close(); }
});

test('malformed addresses are rejected without any network access', async () => {
    for (const bad of ['', 'no-at-sign', 'a@b', 'a b@c.test', 'x'.repeat(301) + '@b.test', null, 42]) {
        const r = await checkEmailExistence(bad);
        assert.equal(r.valid, false, `${String(bad)} should be invalid`);
        assert.equal(r.undetermined, false, `${String(bad)} should be definitive`);
    }
});

test('checkMultipleEmails does not deadlock beyond the concurrency cap', async () => {
    // More addresses than MAX_PARALLEL_EMAILS (10). Before the two-pool fix a
    // nested limiter on one pool would hang here forever.
    const emails = Array.from({ length: 40 }, (_, i) => `bad-${i}@invalid`);
    const results = await Promise.race([
        checkMultipleEmails(emails, 1000),
        new Promise((_, rej) => setTimeout(() => rej(new Error('deadlocked')), 15000).unref()),
    ]);
    assert.equal(results.length, emails.length);
    assert.deepEqual([...new Set(results.map((r) => r.valid))], [false]);
    results.forEach((r, i) => assert.equal(r.email, emails[i], 'results keep input order'));
});

test('every result carries the email it belongs to', async () => {
    const results = await checkMultipleEmails(['bad', 'also-bad'], 1000);
    assert.deepEqual(results.map((r) => r.email), ['bad', 'also-bad']);
});

test('package.json is reachable through the exports map', async () => {
    // Node self-references the package by name via its own "exports" map, so
    // this fails the same way a consumer's `require(pkg + '/package.json')`
    // would if the subpath were missing.
    const pkg = require('advanced-email-existence/package.json');
    assert.equal(pkg.name, 'advanced-email-existence');
    assert.ok(pkg.version, 'version should be readable by tooling');
});
