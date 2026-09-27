# Advanced Email Existence

**Advanced Email Existence** is a Node.js library that verifies whether an email address exists by querying the domain's mail exchange (MX) servers. It performs real-time verification by connecting to the SMTP server(s) of the email's domain and sending partial SMTP commands to validate the existence of the email address.

Zero transitive vulnerabilities, one dependency, and no data ever leaves your process.

## Features

- **Email Format Validation:** Ensures the email is in a valid format (e.g., `name@domain.com`).
- **MX Record Lookup:** Resolves mail exchange (MX) records for the email domain, with in-process caching.
- **SMTP Verification:** Connects to the domain's mail server and uses SMTP commands (`HELO`, `MAIL FROM`, `RCPT TO`) to verify the email.
- **Multiple Email Support:** Validate an array of emails in parallel, with bounded concurrency.
- **Customizable Timeout:** Allows setting a custom timeout for SMTP connections.
- **Honest Verdicts:** Definitive rejections, temporary failures and blocklisting are reported distinctly rather than lumped together.

## Requirements

Node.js **20 or newer**.

Outbound TCP on port 25 must be permitted. Most residential ISPs and many cloud providers (AWS EC2, Azure, Google Cloud) block it by default, in which case every check returns `undetermined`.

## Installation

```bash
npm install advanced-email-existence
```

or

```bash
yarn add advanced-email-existence
```

## Usage

Both entry points expose the same two **named** exports. There is no default export.

### Single Email Validation

#### ES Module

```javascript
import { checkEmailExistence } from 'advanced-email-existence';

const result = await checkEmailExistence('test@example.com');
console.log(result);
// { email: 'test@example.com', valid: true, undetermined: false }
```

#### CommonJS

```javascript
const { checkEmailExistence } = require('advanced-email-existence');

(async () => {
    const result = await checkEmailExistence('test@example.com');
    console.log(result);
    // { email: 'test@example.com', valid: true, undetermined: false }
})();
```

### Parameters

- **`email` (string, required):** The email address to verify.
- **`timeout` (integer, optional):** The maximum time in milliseconds to wait for a response from the mail server. Default is `5000`.
- **`fromEmail` (string, optional):** The address to use for the `MAIL FROM` SMTP command. Defaults to the email being verified. Using a real, deliverable address on a domain you control significantly reduces the number of undetermined results.

```javascript
const result = await checkEmailExistence('test@example.com', 10000, 'noreply@mydomain.com');
```

### Response

`checkEmailExistence` resolves to an object with three properties:

| Property | Type | Meaning |
| --- | --- | --- |
| `email` | string | The address that was checked. |
| `valid` | boolean | The mail server accepted the recipient. |
| `undetermined` | boolean | No conclusion could be reached. |

The two booleans combine into exactly three states:

| `valid` | `undetermined` | Interpretation |
| --- | --- | --- |
| `true` | `false` | The mailbox exists. |
| `false` | `false` | The mailbox definitively does not exist — bad format, no MX records for the domain, or a `5xx` rejection of `RCPT TO`. |
| `false` | `true` | Unknown — greylisting, a `4xx` temporary failure, a connection error or timeout, a transient DNS failure, or a server that refused to disclose. |

Treat `undetermined: true` as "try again later", never as "invalid". Deleting addresses on an undetermined result will discard good ones.

```json
{
  "email": "test@example.com",
  "valid": true,
  "undetermined": false
}
```

## Multi-Email Validation

Use `checkMultipleEmails` to verify an array of addresses. Checks run in parallel with bounded concurrency, and results are returned **in the same order as the input**.

### ES Module

```javascript
import { checkMultipleEmails } from 'advanced-email-existence';

const emails = ['test1@example.com', 'test2@domain.com'];
const results = await checkMultipleEmails(emails);
console.log(results);
// [
//   { email: 'test1@example.com', valid: true,  undetermined: false },
//   { email: 'test2@domain.com',  valid: false, undetermined: true  }
// ]
```

### CommonJS

```javascript
const { checkMultipleEmails } = require('advanced-email-existence');

(async () => {
    const results = await checkMultipleEmails(['test1@example.com', 'test2@domain.com']);
    console.log(results);
})();
```

### Parameters

- **`emails` (array, required):** The email addresses to verify.
- **`timeout` (integer, optional):** Per-connection timeout in milliseconds. Default is `5000`.
- **`fromEmail` (string, optional):** The address used for `MAIL FROM`. Defaults to each email being verified.

```javascript
const results = await checkMultipleEmails(emails, 10000, 'noreply@mydomain.com');
```

Each entry has the same shape as a single `checkEmailExistence` result. Failures never reject — an address that could not be checked comes back as `{ email, valid: false, undetermined: true }`.

## Behaviour Notes

- **Concurrency:** At most 10 email checks and 10 simultaneous SMTP connections are in flight, tracked by two independent pools so a large batch cannot stall itself.
- **MX priority and fallback:** MX hosts are tried together, lowest priority number first. The first *definitive* answer wins; hosts that error out are skipped rather than deciding the outcome.
- **MX caching:** Successful lookups and permanent failures (`ENOTFOUND`, `ENODATA`, `NXDOMAIN`) are cached for the lifetime of the process. Transient DNS failures are not cached and surface as undetermined.
- **Multi-line SMTP replies:** Continuation lines (`250-STARTTLS`) are buffered and only final reply lines are acted on.
- **Blocklisting:** If the server rejects your IP (for example via Spamhaus), that is reported as undetermined rather than as a missing mailbox.
- **Port 25 only:** Submission ports 587 and 465 require authentication and cannot be used for recipient probing.

## Common Use Cases

1. **Email Signup Validation:** Ensure users provide valid email addresses during signup.
2. **Bulk Email List Validation:** Validate lists before sending campaigns.
3. **Database Cleansing:** Remove invalid emails to improve list quality.

## Limitations

- **Port 25 egress:** Commonly blocked by ISPs and cloud providers; without it every result is undetermined.
- **Catch-all domains:** Accept every recipient, so `valid: true` can be a false positive.
- **Privacy policies:** Large providers such as Gmail, Outlook and Yahoo deliberately obscure recipient existence, often returning undetermined.
- **Rate limits and reputation:** Repeated probing from one IP invites greylisting or blocklisting. Throttle bulk runs.

## Testing

```bash
npm test
```

The suite runs fully offline against local fake SMTP servers, so it needs no network access and touches no real mailboxes.

## Dependencies

- **[`p-limit`](https://www.npmjs.com/package/p-limit):** Bounds concurrency. The only runtime dependency.

MX resolution and TCP use the Node built-ins `dns/promises` and `net`. Earlier versions listed `dns` and `net` as npm dependencies; those are unrelated third-party packages, not the built-ins, and have been removed.

## Future Enhancements

- Configurable concurrency limits and SMTP port.
- Catch-all domain detection to reduce false positives.
- TypeScript type declarations.

## License

MIT

## Contributing

Contributions are welcome. Feel free to open issues or submit pull requests.

## Contact

For issues, questions, or feature requests, please raise an issue on [GitHub](https://github.com/Varshneyhars/advanced-email-existence/issues).
