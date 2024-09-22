# Advanced Email Existence

**Advanced Email Existence** is a Node.js library that verifies whether an email address exists by querying the domain's mail exchange (MX) servers. It performs real-time verification by connecting to the SMTP server(s) of the email's domain and sending partial SMTP commands to validate the existence of the email address.

## Features

- **Email Format Validation:** Ensures the email is in a valid format (e.g., `name@domain.com`).
- **MX Record Lookup:** Resolves mail exchange (MX) records for the email domain.
- **SMTP Verification:** Connects to the domain's mail server and uses SMTP commands (`HELO`, `MAIL FROM`, `RCPT TO`) to verify the email.
- **Multiple Email Support:** Validate an array of emails in parallel.
- **Customizable Timeout:** Allows setting a custom timeout for SMTP connections.
- **Optimized for Speed:** Uses parallel MX resolution and optimized connection timeouts.

## Installation

Install the library using npm or yarn:

```bash
npm install advanced-email-existence
```

or

```bash
yarn add advanced-email-existence
```

## Usage

Here’s how you can use the `checkEmailExistence` function, supporting both ES Modules and CommonJS:

### Single Email Validation

#### ES Module Example

```javascript
import checkEmailExistence from 'advanced-email-existence';

(async () => {
    const result = await checkEmailExistence('test@example.com');
    console.log(result); // { valid: true/false, undetermined: true/false }
})();
```

#### CommonJS Example

```javascript
const checkEmailExistence = require('advanced-email-existence');

(async () => {
    const result = await checkEmailExistence('test@example.com');
    console.log(result); // { valid: true/false, undetermined: true/false }
})();
```

### Parameters

- **`email` (string, required):** The email address to verify.
- **`timeout` (integer, optional):** The maximum time (in milliseconds) to wait for a response from the mail server. Default is `5000` milliseconds (5 seconds).
- **`fromEmail` (string, optional):** The email address to use for the `MAIL FROM` SMTP command. Defaults to the email being verified.

### Example with Custom Parameters

```javascript
const result = await checkEmailExistence('test@example.com', 10000, 'noreply@mydomain.com');
console.log(result); // { valid: true, undetermined: false }
```

### Response

The `checkEmailExistence` function returns a `Promise` that resolves to an object containing the following properties:

- **`valid` (boolean):** Indicates whether the email address is valid (i.e., the mail server accepted it).
- **`undetermined` (boolean):** Indicates whether the result is undetermined (i.e., the server did not respond conclusively).

#### Example Response

```json
{
  "valid": true,
  "undetermined": false
}
```

## Multi-Email Validation

To verify multiple email addresses simultaneously, use the `checkEmailsExistence` function. This function takes an array of emails and checks each email in parallel, returning the result for each.

### ES Module Example (for multiple emails)

```javascript
import { checkEmailsExistence } from 'advanced-email-existence';

(async () => {
    const emails = ['test1@example.com', 'test2@domain.com'];
    const results = await checkEmailsExistence(emails);
    console.log(results);
    // [
    //   { email: 'test1@example.com', valid: true, undetermined: false },
    //   { email: 'test2@domain.com', valid: false, undetermined: true }
    // ]
})();
```

### CommonJS Example (for multiple emails)

```javascript
const { checkEmailsExistence } = require('advanced-email-existence');

(async () => {
    const emails = ['test1@example.com', 'test2@domain.com'];
    const results = await checkEmailsExistence(emails);
    console.log(results);
    // [
    //   { email: 'test1@example.com', valid: true, undetermined: false },
    //   { email: 'test2@domain.com', valid: false, undetermined: true }
    // ]
})();
```

### Parameters for Multi-Email Validation

- **`emails` (array, required):** An array of email addresses to verify.
- **`timeout` (integer, optional):** The maximum time (in milliseconds) to wait for a response from the mail server. Default is `5000` milliseconds (5 seconds).
- **`fromEmail` (string, optional):** The email address to use for the `MAIL FROM` SMTP command. Defaults to the email being verified.

### Example with Custom Parameters for Multi-Email Validation

```javascript
const emails = ['test1@example.com', 'test2@domain.com'];
const results = await checkEmailsExistence(emails, 10000, 'noreply@mydomain.com');
console.log(results);
// Output: [
//   { email: 'test1@example.com', valid: true, undetermined: false },
//   { email: 'test2@domain.com', valid: false, undetermined: true }
// ]
```

### Response for Multiple Emails

The `checkEmailsExistence` function will return an array of results. Each result contains the following properties:

- **`email` (string):** The email address being checked.
- **`valid` (boolean):** Indicates whether the email address is valid (i.e., the mail server accepted it).
- **`undetermined` (boolean):** Indicates whether the result is undetermined (i.e., the server did not respond conclusively).
- **`error` (string, optional):** If an error occurs during validation, the error message is included.

#### Example Response for Multi-Email Check

```json
[
  {
    "email": "test1@example.com",
    "valid": true,
    "undetermined": false
  },
  {
    "email": "test2@domain.com",
    "valid": false,
    "undetermined": true,
    "error": "Connection timeout"
  }
]
```

## Optimizations

- **Parallel MX Resolution:** MX records are resolved in parallel for faster results.
- **Connection Timeout:** The default timeout is 5000ms (5 seconds), configurable for faster or more lenient timeouts.
- **Port 25:** SMTP connections are made over port 25 to maintain compatibility with most mail servers.
- **Error Handling:** Undetermined results are returned if mail servers do not respond conclusively, ensuring robust handling of possible issues.

## Common Use Cases

1. **Email Signup Validation:** Ensure users provide valid email addresses during signup or registration.
2. **Bulk Email List Validation:** Validate large lists of emails before sending out marketing campaigns.
3. **Database Cleansing:** Remove invalid emails from your user database to improve the quality of your email list.

## Limitations

- **SMTP Server Rate Limits:** Some email servers apply rate-limiting to SMTP commands, potentially causing undetermined results.
- **Privacy Settings:** Certain servers hide the existence of email addresses due to privacy or security policies.
- **False Positives:** Catch-all domains may accept all email addresses, resulting in possible false positives.

## License

This project is licensed under the MIT License.

## Contributing

We welcome contributions! Feel free to open issues, submit pull requests, or suggest new features.

## Contact

For issues, questions, or feature requests, please raise an issue on GitHub.

---

### Dependencies

- **`dns/promises`:** For resolving MX records of the email domain.
- **`net`:** For establishing a TCP connection to the mail server and sending SMTP commands.

## Future Enhancements

- Add support for throttling requests to avoid rate-limiting issues.
- Improve handling for catch-all domains to reduce false positives.
