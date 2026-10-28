const { Resend } = require('resend');

let resend = null;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
} else {
  console.warn('[Resend] RESEND_API_KEY not found in environment variables. Email sending will be simulated.');
}

module.exports = resend;
