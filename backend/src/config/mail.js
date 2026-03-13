const nodemailer = require('nodemailer');
const env = require('./env');

const hasSmtpConfig = Boolean(env.smtp.host && env.smtp.user && env.smtp.pass);

const transporter = hasSmtpConfig
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: {
        user: env.smtp.user,
        pass: env.smtp.pass,
      },
    })
  : nodemailer.createTransport({
      jsonTransport: true,
    });

module.exports = { transporter, hasSmtpConfig };
