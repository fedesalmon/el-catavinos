// Envío de emails. Si no hay SMTP configurado (variables SMTP_*), los emails se
// muestran en la consola del servidor y la web sigue funcionando con normalidad.
const nodemailer = require('nodemailer');

let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

async function sendMail({ to, subject, text, replyTo }) {
  if (!to) return;
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || 'El Catavinos <no-reply@elcatavinos.net>';
  if (!transporter) {
    console.log(`[email no enviado: falta SMTP] Para: ${to} | ${subject}\n${text}\n`);
    return;
  }
  try {
    await transporter.sendMail({ from, to, subject, text, replyTo });
  } catch (err) {
    console.error('Error enviando email:', err.message);
  }
}

module.exports = { sendMail, mailEnabled: () => !!transporter };
