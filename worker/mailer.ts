import { AwsClient } from 'aws4fetch'
import type { Env } from './env'

export interface SignInEmail {
  to: string
  /** The Magic Link. */
  link: string
  /** The six-digit Sign-in Code. */
  code: string
}

/** Sends Sign-in Emails. Tests use a fake. */
export interface Mailer {
  sendSignInEmail(email: SignInEmail): Promise<void>
}

export const SIGN_IN_MINUTES = 15

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function renderSignInEmail({ link, code }: SignInEmail): { subject: string; text: string; html: string } {
  const subject = `Your Sudoku sign-in code is ${code}`
  const text = [
    'Sign in to Sudoku',
    '',
    `Tap this link in your browser: ${link}`,
    '',
    `Or type this Sign-in Code into the app: ${code}`,
    '',
    `The link and the code both expire in ${SIGN_IN_MINUTES} minutes, and either one can be used once.`,
    "If you didn't ask to sign in, you can ignore this email.",
  ].join('\n')
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
<h2>Sign in to Sudoku</h2>
<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none">Sign in</a></p>
<p>Or type this Sign-in Code into the app:</p>
<p style="font-size:28px;letter-spacing:6px;font-family:ui-monospace,monospace"><strong>${escapeHtml(code)}</strong></p>
<p>The link and the code both expire in ${SIGN_IN_MINUTES} minutes, and either one can be used once.</p>
<p style="color:#666">If you didn't ask to sign in, you can ignore this email.</p>
</body></html>`
  return { subject, text, html }
}

/** Sends through the AWS SES v2 HTTPS API, signed with SigV4. */
export class SesMailer implements Mailer {
  private readonly aws: AwsClient
  constructor(private readonly env: Pick<Env, 'SES_REGION' | 'EMAIL_FROM' | 'AWS_ACCESS_KEY_ID' | 'AWS_SECRET_ACCESS_KEY'>) {
    this.aws = new AwsClient({
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      region: env.SES_REGION,
      service: 'ses',
    })
  }

  async sendSignInEmail(email: SignInEmail): Promise<void> {
    const { subject, text, html } = renderSignInEmail(email)
    const res = await this.aws.fetch(`https://email.${this.env.SES_REGION}.amazonaws.com/v2/email/outbound-emails`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        FromEmailAddress: this.env.EMAIL_FROM,
        Destination: { ToAddresses: [email.to] },
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: 'UTF-8' },
            Body: { Text: { Data: text, Charset: 'UTF-8' }, Html: { Data: html, Charset: 'UTF-8' } },
          },
        },
      }),
    })
    if (!res.ok) throw new Error(`SES responded ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
}
