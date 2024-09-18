

# Email Existence Checker

**Email Existence Checker** is a Node.js library that verifies whether an email address exists by querying the domain's mail exchange (MX) servers. It performs a real-time check by connecting to the SMTP server(s) for the domain and sending partial SMTP commands to validate the existence of the email address.

## Features

- **Email Format Validation:** Checks if the email is in a valid format.
- **MX Record Lookup:** Resolves mail exchange (MX) records for the email domain.
- **SMTP Verification:** Attempts to connect to the domain's mail server and verifies the email address using the `HELO`, `MAIL FROM`, and `RCPT TO` SMTP commands.
- **Optimized for Speed:** Uses parallel MX record verification and reduces connection timeout for faster results.
- **Customizable Timeout:** You can set a custom timeout for SMTP connections.

## Installation

Install the library using npm or yarn:

```bash
npm install email-existence-checker
```

or

```bash
yarn add email-existence-checker
```

## Usage

Here's an example of how to use the `checkEmailExistence` function:

```javascript
import checkEmailExistence from 'email-existence-checker';

(async () => {
    const result = await checkEmailExistence('test@example.com');
    console.log(result); // { valid: true/false, undetermined: true/false }
})();
```

### Parameters

- `email` (string, required): The email address you want to check.
- `timeout` (integer, optional): The maximum time (in milliseconds) to wait for a response from the mail server. The default is 5000 milliseconds (5 seconds).
- `fromEmail` (string, optional): The email address used for the `MAIL FROM` command in the SMTP exchange. By default, the email being checked will be used.

### Example

```javascript
import checkEmailExistence from './index.js';

(async () => {
    const result = await checkEmailExistence('test@example.com', 10000, 'noreply@mydomain.com');
    console.log(result); // { valid: true, undetermined: false }
})();
```

### Response

The `checkEmailExistence` function returns a promise that resolves to an object containing the following properties:

- `valid` (boolean): Indicates whether the email address is valid (i.e., the mail server accepted it).
- `undetermined` (boolean): Indicates whether the result is undetermined (i.e., the server did not respond definitively).

### Example Output

```json
{
  "valid": true,
  "undetermined": false
}
```

### Error Handling

In case of DNS resolution failure, invalid email format, or undetermined server responses, the function handles errors gracefully and provides meaningful logs for debugging purposes.

## Optimizations

This library is optimized for speed:
- **Parallel MX Checking:** MX records are checked in parallel using `Promise.any`. The first successful response is returned immediately.
- **Connection Timeout:** The connection timeout is configurable and defaults to 5000ms (5 seconds) for faster responses.
- **Port 25 Usage:** SMTP verification only uses port 25 to maintain compatibility with most email servers.

## API

### `checkEmailExistence(email, timeout = 5000, fromEmail = email)`

- `email`: The email address you want to verify.
- `timeout`: (Optional) The timeout in milliseconds for the SMTP connection. Default is 5000.
- `fromEmail`: (Optional) The email address used in the `MAIL FROM` command. Defaults to the email being checked.

Returns a `Promise` that resolves to an object `{ valid, undetermined }`.

### Example:

```javascript
const result = await checkEmailExistence('hello@domain.com');
console.log(result);
// Output: { valid: true, undetermined: false }
```

### Return Values:
- `valid`: `true` if the email address exists, otherwise `false`.
- `undetermined`: `true` if the result could not be definitively determined.

## Common Use Cases

1. **Email Signup Validation:** Ensure users provide valid email addresses during signup.
2. **Bulk Email Verification:** Validate email lists before sending bulk emails.
3. **Data Cleaning:** Remove invalid emails from your database.

## Limitations

- **SMTP Servers Rate Limit:** Some email servers may implement rate-limiting for SMTP commands, causing delays or undetermined results.
- **Privacy Controls:** Some mail servers may not reveal the existence of an email address due to privacy controls or security policies.
- **Not 100% Reliable:** Certain servers might respond with false positives or reject emails even if they exist (e.g., anti-spam measures).

## License

This project is licensed under the MIT License.

---

## Contributing

We welcome contributions! Feel free to open issues, submit pull requests, or suggest new features.

## Contact

For issues, questions, or feature requests, please raise an issue on GitHub.

---

### Dependencies

- **dns/promises:** For resolving MX records of the email domain.
- **net:** For establishing a TCP connection to the mail server and sending SMTP commands.

