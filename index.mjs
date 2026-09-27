// ESM entry point. The implementation lives in index.cjs and is re-exported
// here so both entry points can never drift apart.
export { checkEmailExistence, checkMultipleEmails } from './index.cjs';
