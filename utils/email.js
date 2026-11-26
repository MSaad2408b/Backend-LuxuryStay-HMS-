const nodemailer = require("nodemailer");
const config = require("../config/env");
const { logger } = require("./logger");

let transporter = null;

const getTransporter = () => {
  if (!config.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporter;
};

const isConfigured = () => Boolean(config.smtp.host);

const sendEmail = async ({ to, subject, html, text }) => {
  if (!to) return { delivered: false, reason: "no_recipient" };
  const transport = getTransporter();
  if (!transport) {
    logger.warn("email_skipped", { to, subject, reason: "smtp_not_configured" });
    return { delivered: false, reason: "smtp_not_configured" };
  }
  try {
    const info = await transport.sendMail({
      from: config.smtp.from,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ""),
    });
    logger.info("email_sent", { to, subject, messageId: info.messageId });
    return { delivered: true, messageId: info.messageId };
  } catch (error) {
    logger.error("email_failed", { to, subject, error: error.message });
    return { delivered: false, reason: error.message };
  }
};

const layout = (title, body) => `<!doctype html><html><head><meta charset="utf-8" />
<title>${title}</title></head><body style="font-family:Arial,sans-serif;color:#111;max-width:640px;margin:24px auto;">
<h1 style="color:#5b3b1d;">LuxuryStay Hospitality</h1><h2>${title}</h2>${body}
<hr style="margin-top:32px;" /><p style="color:#777;font-size:12px;">This is an automated message from LuxuryStay HMS.</p>
</body></html>`;

const templates = {
  welcome: (name) => layout("Welcome", `<p>Hello ${name},</p><p>Your LuxuryStay account is ready. You can now make reservations and manage your profile.</p>`),
  bookingConfirmed: (name, code) => layout("Booking Confirmed", `<p>Hello ${name},</p><p>Your booking <strong>${code}</strong> has been confirmed. Thank you for choosing LuxuryStay.</p>`),
  bookingCancelled: (name, code) => layout("Booking Cancelled", `<p>Hello ${name},</p><p>Your booking <strong>${code}</strong> has been cancelled.</p>`),
  invoice: (name, invoiceNumber, total) => layout("Your Invoice", `<p>Hello ${name},</p><p>Invoice <strong>${invoiceNumber}</strong> for <strong>${total}</strong> is ready. Please find the details below.</p>`),
  passwordReset: (token, minutes) => layout("Password Reset", `<p>Use the token below to reset your password. It expires in ${minutes} minutes.</p><p style="font-size:18px;letter-spacing:1px;"><strong>${token}</strong></p>`),
  generic: (title, message) => layout(title, `<p>${message}</p>`),
};

module.exports = { sendEmail, isConfigured, templates };
