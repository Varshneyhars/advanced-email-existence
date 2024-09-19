// Import dns and net based on the environment (CommonJS or ES Module)
let dns, net;

if (typeof require !== 'undefined') {
    dns = require('dns/promises');
    net = require('net');
} else {
    dns = await import('dns/promises');
    net = await import('net');
}

const MAX_EMAIL_LEN = 300;
const CONNECTION_TIMEOUT = 5000; // Reduced timeout for faster response

async function checkEmailExistence(email, timeout = CONNECTION_TIMEOUT, fromEmail = email) {
    // Validate email format and length
    if (email.length > MAX_EMAIL_LEN || !/^\S+@\S+$/.test(email)) {
        // console.log('Invalid email format or too long.');
        return { valid: false, undetermined: false };
    }

    const domain = email.split('@')[1];

    let addresses;
    try {
        // Resolve MX records for the domain
        addresses = (await dns.resolveMx(domain)).sort((a, b) => a.priority - b.priority);
    } catch (err) {
        // console.log('DNS resolution failed:', err);
        return { valid: false, undetermined: false };
    }

    // Try connecting to each MX server in parallel for faster results
    const checkPromises = addresses.map(({ exchange }) =>
        checkMXServer(exchange, email, fromEmail, timeout)
    );

    // Use Promise.any to return the first resolved valid result (fastest response)
    try {
        const result = await Promise.any(checkPromises);
        return result;
    } catch (err) {
        // console.log('All MX servers returned undetermined or failed.');
        return { valid: false, undetermined: true };
    }
}

async function checkMXServer(mxHost, email, fromEmail, timeout) {
    const commands = [
        `helo ${mxHost}`,
        `mail from: <${fromEmail}>`,
        `rcpt to: <${email}>`
    ];

    return new Promise((resolve, reject) => {
        const port = 25; // Only use port 25

        // console.log(`Trying connection to ${mxHost} on port ${port}`);
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
            conn.destroy(); // Close the connection on error
            reject(); // Treat connection failure as undetermined
        });

        conn.on('timeout', () => {
            conn.destroy(); // Close the connection on timeout
            reject(); // Treat timeout as undetermined
        });

        conn.on('end', () => {
            resolve({ valid: response, undetermined: !response });
        });
    });
}

// Exports for ES modules and CommonJS compatibility
// For CommonJS
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = checkEmailExistence;
}

// For ES Modules (must be at the top level)
export default checkEmailExistence;
