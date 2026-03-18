import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const fromEmail = process.env.EMAIL_FROM || 'AUTMN <onboarding@resend.dev>'

export async function sendVerificationEmail(email: string, token: string) {
  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${token}`

  await resend.emails.send({
    from: fromEmail,
    to: email,
    subject: 'Verify your AUTMN account',
    html: `
      <div style="font-family: Inter, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: bold; color: #111827; margin-bottom: 8px;">AUTMN</h1>
        <p style="color: #6B7280; font-size: 14px; margin-bottom: 24px;">Compliance Intelligence Platform</p>
        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
        <p style="color: #111827; font-size: 14px; line-height: 1.6;">
          Click the button below to verify your email address and activate your account.
        </p>
        <a href="${verifyUrl}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background-color: #2563EB; color: white; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 500;">
          Verify Email
        </a>
        <p style="color: #9CA3AF; font-size: 12px; margin-top: 24px;">
          If you didn't create an account, you can safely ignore this email.
        </p>
        <p style="color: #9CA3AF; font-size: 12px; margin-top: 8px;">
          Link not working? Copy this URL: ${verifyUrl}
        </p>
      </div>
    `,
  })
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`

  await resend.emails.send({
    from: fromEmail,
    to: email,
    subject: 'Reset your AUTMN password',
    html: `
      <div style="font-family: Inter, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: bold; color: #111827; margin-bottom: 8px;">AUTMN</h1>
        <p style="color: #6B7280; font-size: 14px; margin-bottom: 24px;">Password Reset</p>
        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
        <p style="color: #111827; font-size: 14px; line-height: 1.6;">
          We received a request to reset your password. Click the button below to choose a new password.
        </p>
        <a href="${resetUrl}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background-color: #2563EB; color: white; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 500;">
          Reset Password
        </a>
        <p style="color: #9CA3AF; font-size: 12px; margin-top: 24px;">
          This link expires in 1 hour. If you didn't request a password reset, ignore this email.
        </p>
      </div>
    `,
  })
}

export async function sendDeadlineReminderEmail(
  email: string,
  obligations: Array<{ name: string; dueDate: string; daysLeft: number; penalty: string }>
) {
  const itemsHtml = obligations.map(ob => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; font-size: 14px; color: #111827;">${ob.name}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; font-size: 14px; color: #111827;">${ob.dueDate}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; font-size: 14px; color: ${ob.daysLeft <= 3 ? '#EF4444' : '#F59E0B'}; font-weight: 500;">
        ${ob.daysLeft === 0 ? 'Due today' : ob.daysLeft === 1 ? 'Due tomorrow' : `${ob.daysLeft} days`}
      </td>
    </tr>
  `).join('')

  await resend.emails.send({
    from: fromEmail,
    to: email,
    subject: `AUTMN: ${obligations.length} compliance deadline${obligations.length > 1 ? 's' : ''} coming up`,
    html: `
      <div style="font-family: Inter, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: bold; color: #111827; margin-bottom: 8px;">AUTMN</h1>
        <p style="color: #6B7280; font-size: 14px; margin-bottom: 24px;">Compliance Deadline Reminder</p>
        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
        <p style="color: #111827; font-size: 14px; margin-bottom: 16px;">
          You have ${obligations.length} upcoming compliance deadline${obligations.length > 1 ? 's' : ''}:
        </p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <thead>
            <tr style="background: #F9FAFB;">
              <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #6B7280; text-transform: uppercase;">Obligation</th>
              <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #6B7280; text-transform: uppercase;">Due Date</th>
              <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #6B7280; text-transform: uppercase;">Time Left</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="display: inline-block; padding: 12px 24px; background-color: #2563EB; color: white; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 500;">
          View Dashboard
        </a>
      </div>
    `,
  })
}
