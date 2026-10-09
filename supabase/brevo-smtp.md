# Send DairyDash account emails through Brevo

Supabase Auth creates accounts, manages passwords and verifies sessions. Brevo delivers its confirmation and password recovery emails through custom SMTP. Configure this in the provider dashboards; the existing DairyDash account flow already supports it.

## 1. Prepare Brevo

Create or sign in to your [Brevo account](https://app.brevo.com/).

In **Settings > Senders, Domains, IPs > Domains**, add the sending domain you control and complete the authentication instructions using the DNS values Brevo supplies. For production, use an address on this domain. You need access to its DNS settings; a hosted website address such as `dairy-dash.vercel.app` does not give you control of the `vercel.app` sending domain. See [Brevo domain authentication](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC).

In **Settings > Senders, Domains, IPs > Senders**, add a sender named **DairyDash** with your actual sender email. Brevo automatically verifies senders on authenticated domains; otherwise complete the verification code sent to the address. See [create a sender](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email).

In **Settings > SMTP & API > SMTP**, copy the **SMTP login** and generate a standard SMTP key named **DairyDash Supabase Auth**. Save the key securely when it is displayed. See [Brevo SMTP keys](https://help.brevo.com/hc/en-us/articles/7959631848850-Create-and-manage-your-SMTP-keys).

## 2. Configure Supabase custom SMTP

Open the DairyDash project in [Supabase](https://supabase.com/dashboard), then **Authentication > Emails > SMTP Settings**. Enable custom SMTP and enter:

| Supabase field | Value |
| --- | --- |
| Sender email address | The verified sender email you added in Brevo |
| Sender name | `DairyDash` |
| Host | `smtp-relay.brevo.com` |
| Port | `587` |
| Username | The exact **SMTP login** shown in Brevo |
| Password | The **SMTP key** generated in Brevo |
| Minimum interval per user, if shown | `60` seconds, matching the app's resend cooldown |

The SMTP login may differ from your Brevo account email. It also serves a different purpose from the sender email. The password must be the SMTP key, not a Brevo API key. See [Brevo SMTP settings](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP).

Save these settings. The SMTP key belongs in Supabase's SMTP password field; DairyDash does not need it in Angular, `.env`, or Vercel environment variables. Supabase continues to generate the email templates and account links. See [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## 3. Set the limits and account URLs

In **Authentication > Rate Limits**, check the email sending limit. Supabase documents an initial custom SMTP limit of **30 messages per hour**, adjustable here. Its built-in mail service allows **2 messages per hour** and only sends to project team addresses. See [Supabase SMTP limits](https://supabase.com/docs/guides/auth/auth-smtp).

Brevo's Free plan currently allows **300 email sends per day**. Confirmation, resend, recovery and other emails sent by this Brevo account share that allowance. Set Supabase's hourly limit to suit expected traffic and your Brevo account's available quota; changing it does not increase Brevo's daily allowance. See [Brevo Free plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan).

Keep **Confirm email** enabled under **Authentication > Providers > Email**. In **Authentication > URL Configuration**, use `https://dairy-dash.vercel.app` as the Site URL for the current deployment and allow:

- `https://dairy-dash.vercel.app/account`
- `https://dairy-dash.vercel.app/account?action=reset`
- `http://localhost:3000/account`
- `http://localhost:3000/account?action=reset`

Add equivalent account URLs if you deploy to another origin. Keep Supabase's standard confirmation and recovery templates using `{{ .ConfirmationURL }}`. Disable email link tracking in Brevo if enabled, so account links are delivered unchanged. See [Supabase production email configuration](https://supabase.com/docs/guides/deployment/going-into-prod).

For a formal confirmation email, apply [the DairyDash confirmation template](templates/README.md) to **Confirm sign up** in Supabase. It uses the same verification link. The updated website displays **Account confirmed** and **You may exit this tab** after successful verification.

## 4. Verify delivery from the app

1. Open DairyDash's `/account` page and create a test account with an email you control that is outside the Supabase project team.
2. Check **Brevo > Transactional > Logs** for the confirmation email, then check the recipient's inbox and spam folder.
3. Open the confirmation link. The updated website should display **Account confirmed** and **You may exit this tab.** Return to DairyDash and sign in; an ordinary account visit displays **Account connected** after the API verifies the saved user.
4. Sign out, request **Forgot password?**, open the recovery email, set a new password and sign in with it.

`npm run db:check` checks database and Auth connectivity without creating users or sending emails. It cannot verify custom SMTP credentials or mailbox delivery. Complete the checks above after saving the dashboard settings.

| Symptom | Check |
| --- | --- |
| `Email address not authorized` | Custom SMTP was saved in the same Supabase project the app uses |
| Email sending rate limit | Supabase's Authentication > Rate Limits and Brevo's remaining email quota |
| SMTP authentication failure | Exact SMTP login and active SMTP key, rather than an API key |
| Sender rejected | Supabase's sender address matches a verified Brevo sender |
| No email in the inbox | Brevo Transactional logs, sender domain authentication and the recipient's spam folder |
| Confirmation/recovery link fails | Allowed redirect URLs, the deployed account page and email link tracking |

See [Brevo SMTP troubleshooting](https://help.brevo.com/hc/en-us/articles/115000188150-Troubleshooting-Issues-with-Brevo-SMTP) for provider-side failures.
