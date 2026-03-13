const env = require('../config/env');
const { transporter, hasSmtpConfig } = require('../config/mail');

const sendMail = async ({ to, subject, html, text }) => {
  const info = await transporter.sendMail({
    from: env.smtp.from,
    to,
    subject,
    text,
    html,
  });

  return {
    messageId: info.messageId || null,
    simulated: !hasSmtpConfig,
  };
};

module.exports = { sendMail };
