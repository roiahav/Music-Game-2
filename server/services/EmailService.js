import nodemailer from 'nodemailer';
import { getSettings } from './SettingsStore.js';

/** Build nodemailer transporter from saved SMTP settings. Throws with specific reason if missing. */
function getTransporter() {
  const { email = {} } = getSettings();
  const { smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass } = email;
  const missing = [];
  if (!smtpHost?.trim()) missing.push('שרת SMTP');
  if (!smtpUser?.trim()) missing.push('משתמש SMTP');
  if (!smtpPass?.trim()) missing.push('סיסמת SMTP');
  if (missing.length) {
    throw new Error(`חסרים שדות: ${missing.join(', ')}`);
  }
  return nodemailer.createTransport({
    host: smtpHost.trim(),
    port: Number(smtpPort) || 587,
    secure: smtpSecure === true,
    auth: { user: smtpUser.trim(), pass: smtpPass },
  });
}

/**
 * Send a password-reset email.
 * @param {string} toEmail  — recipient address
 * @param {string} firstName — recipient's first name (for greeting)
 * @param {string} resetUrl  — full URL with token
 */
export async function sendResetEmail(toEmail, firstName, resetUrl) {
  const transporter = getTransporter();

  const { email = {} } = getSettings();
  const fromName  = email.fromName  || 'Music Game';
  const fromEmail = email.fromEmail || email.smtpUser;

  const greeting = firstName ? `שלום ${firstName},` : 'שלום,';

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#1e1e1e;font-family:Arial,sans-serif;color:#ffffff;direction:rtl">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1e1e1e;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#2d2d30;border-radius:16px;overflow:hidden;border:1px solid #3a3a3a">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#007ACC,#004f8a);padding:28px 32px;text-align:center">
            <div style="font-size:42px;margin-bottom:8px">🎵</div>
            <h1 style="margin:0;font-size:20px;font-weight:900;color:#fff">איפוס סיסמה</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:28px 32px">
            <p style="margin:0 0 16px;font-size:15px;color:#ddd;line-height:1.6">${greeting}</p>
            <p style="margin:0 0 20px;font-size:15px;color:#ddd;line-height:1.6">
              קיבלנו בקשה לאיפוס הסיסמה שלך לאפליקציית <strong>Music Game</strong>.<br>
              לחץ על הכפתור למטה כדי לבחור סיסמה חדשה.
            </p>
            <!-- Button -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:8px 0 24px">
                  <a href="${resetUrl}"
                     style="display:inline-block;background:#007ACC;color:#fff;text-decoration:none;
                            font-size:16px;font-weight:800;padding:14px 36px;border-radius:12px;
                            letter-spacing:0.3px">
                    🔑 איפוס סיסמה
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;color:#888;line-height:1.5">
              הקישור בתוקף למשך <strong style="color:#aaa">שעה אחת</strong> מרגע שליחת המייל.
            </p>
            <p style="margin:0;font-size:13px;color:#888;line-height:1.5">
              אם לא ביקשת איפוס סיסמה — ניתן להתעלם ממייל זה, הסיסמה שלך לא תשתנה.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #3a3a3a;text-align:center">
            <p style="margin:0;font-size:11px;color:#555">
              לא ניתן להשיב למייל זה · נשלח אוטומטית על ידי Music Game
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: toEmail,
    subject: '🔑 איפוס סיסמה — Music Game',
    html,
    text: `${greeting}\n\nקיבלנו בקשה לאיפוס הסיסמה שלך.\nלחץ על הקישור הבא כדי לאפס:\n${resetUrl}\n\nהקישור בתוקף לשעה אחת.`,
  });
}

/**
 * Send an invite email — link goes to the registration page.
 */
export async function sendInviteEmail(toEmail, recipientFirstName, inviteUrl, fromAdminName) {
  const transporter = getTransporter();
  const { email = {} } = getSettings();
  const fromName  = email.fromName  || 'Music Game';
  const fromEmail = email.fromEmail || email.smtpUser;
  const greeting  = recipientFirstName ? `שלום ${recipientFirstName},` : 'שלום,';
  const invitedBy = fromAdminName ? `${fromAdminName} הזמין/ה אותך` : 'הוזמנת';

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#1e1e1e;font-family:Arial,sans-serif;color:#fff;direction:rtl">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1e1e1e;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#2d2d30;border-radius:16px;overflow:hidden;border:1px solid #3a3a3a">
        <tr>
          <td style="background:linear-gradient(135deg,#1db954,#0f7a36);padding:28px 32px;text-align:center">
            <div style="font-size:42px;margin-bottom:8px">🎵</div>
            <h1 style="margin:0;font-size:20px;font-weight:900;color:#fff">הוזמנת ל-Music Game!</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px">
            <p style="margin:0 0 16px;font-size:15px;color:#ddd;line-height:1.6">${greeting}</p>
            <p style="margin:0 0 20px;font-size:15px;color:#ddd;line-height:1.6">
              ${invitedBy} להצטרף לאפליקציית <strong>Music Game</strong> — חידון מוזיקה משעשע למשפחה ולחברים.<br>
              לחץ על הכפתור למטה כדי להירשם וליצור חשבון אישי.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center" style="padding:8px 0 24px">
                <a href="${inviteUrl}"
                   style="display:inline-block;background:#1db954;color:#fff;text-decoration:none;
                          font-size:16px;font-weight:800;padding:14px 36px;border-radius:12px;letter-spacing:0.3px">
                  ✨ הירשם עכשיו
                </a>
              </td></tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;color:#888;line-height:1.5">
              הקישור בתוקף ל-<strong style="color:#aaa">7 ימים</strong>.
            </p>
            <p style="margin:0;font-size:13px;color:#888;line-height:1.5">
              לאחר הרישום, החשבון יעבור לאישור מנהל לפני שתוכל להיכנס.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #3a3a3a;text-align:center">
            <p style="margin:0;font-size:11px;color:#555">לא ניתן להשיב למייל זה · נשלח אוטומטית</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: toEmail,
    subject: '🎵 הוזמנת ל-Music Game!',
    html,
    text: `${greeting}\n\n${invitedBy} להצטרף ל-Music Game.\nלהרשמה: ${inviteUrl}\n\nהקישור בתוקף ל-7 ימים.`,
  });
}

/** Test SMTP connection — throws if it fails. */
export async function testSmtp() {
  const transporter = getTransporter(); // throws if not configured
  await transporter.verify();
}
