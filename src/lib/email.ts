import { Resend } from 'resend'

const FROM_ADDRESS = 'CourtOps <hello@courtops.app>'

function getClient() {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY is not set')
  return new Resend(key)
}

export interface InviteEmailParams {
  to: string
  orgName: string
  inviterName: string
  inviteLink: string
  role: string
  expiresAt: string
}

export async function sendInviteEmail(params: InviteEmailParams) {
  const { to, orgName, inviterName, inviteLink, role, expiresAt } = params
  const expiry = new Date(expiresAt).toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>You're invited to ${escapeHtml(orgName)} on CourtOps</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #eee;">
              <h1 style="margin:0;font-size:24px;color:#111;font-weight:700;letter-spacing:-0.02em;">
                Court<span style="color:#ea580c;">Ops</span>
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <h2 style="margin:0 0 16px;font-size:20px;color:#111;font-weight:600;">
                You're invited to join ${escapeHtml(orgName)}
              </h2>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#444;">
                ${escapeHtml(inviterName)} invited you to join <strong>${escapeHtml(orgName)}</strong> on CourtOps as a <strong>${escapeHtml(role)}</strong>.
              </p>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#444;">
                Click the button below to accept the invite and set up your account.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#ea580c;border-radius:8px;">
                    <a href="${escapeHtml(inviteLink)}" style="display:inline-block;padding:12px 28px;color:#fff;text-decoration:none;font-weight:600;font-size:15px;">
                      Accept Invite
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;color:#888;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 28px;font-size:13px;color:#666;word-break:break-all;">
                <a href="${escapeHtml(inviteLink)}" style="color:#ea580c;text-decoration:underline;">${escapeHtml(inviteLink)}</a>
              </p>
              <p style="margin:0;font-size:13px;color:#888;">
                This invite expires on <strong>${escapeHtml(expiry)}</strong>. If you weren't expecting this, you can safely ignore it.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background:#fafafa;border-top:1px solid #eee;text-align:center;">
              <p style="margin:0;font-size:12px;color:#999;">
                CourtOps — Operations platform for court sport clubs
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  const subject = `You're invited to join ${orgName} on CourtOps`

  const client = getClient()
  const { data, error } = await client.emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
  })

  if (error) throw new Error(error.message)
  return data
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
