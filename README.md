# school-payment-server

Tiny Vercel serverless function that verifies Paystack payments for the Newtown Academy portal.

## Deploy (all doable from a phone browser)
1. Create a new GitHub repo (e.g. `school-payment-server`) and upload these files, keeping the `api/` folder.
2. On vercel.com (the new account): Add New > Project > import that repo > Deploy.
3. In the project: Settings > Environment Variables, add
   - `PAYSTACK_SECRET_KEY` = your Paystack secret key (sk_test_... for now, sk_live_... when going live)
   - `ALLOWED_ORIGIN` = your site origin, e.g. `https://yourname.github.io` (no trailing slash, no path)
4. Redeploy (Deployments > ... > Redeploy) so the variables take effect.
5. Test: open `https://<your-project>.vercel.app/api/verify` in a browser. You should see
   `{"status":false,"message":"Method not allowed"}`. That means it is live.
6. In `register.html` and `student.html`, change `VERIFY_ENDPOINT` to
   `https://<your-project>.vercel.app/api/verify`.

## Notes
- The secret key lives only in Vercel. Never put it in the portal files.
- Use the matching key pair: test public key in the portal needs the sk_test key here; switch both to live together.

## Email (api/send-credentials.js)
Sends the parent's login-details email after an admin approves an application.
Only a signed-in admin (a user with a doc in Firestore `admins/{uid}`) can call it.

Extra environment variables on Vercel:
- `GMAIL_USER` = the Gmail address that will send the mail
- `GMAIL_APP_PASSWORD` = a Google App Password (Google Account > Security > turn on 2-Step Verification > App passwords > create one; 16 characters, no spaces)
- `SCHOOL_NAME` (optional, default "Newtown Academy")
- `PORTAL_URL` (optional but recommended) = your website base address, e.g. https://yourname.github.io/yourrepo (no trailing slash). Adds the school logo and a "Log in to the Student Portal" button to the email
- `LOGO_URL` (optional) = a direct image link, only if you want a different logo than assets/newtown-academy-logo.jpg

After adding them, redeploy. Gmail allows roughly 500 emails a day, far more than needed.

## Defaults baked in
If `ALLOWED_ORIGIN` or `PORTAL_URL` are not set in Vercel, the code falls back to
`https://enoche-001.github.io` and `https://enoche-001.github.io/fullschool`.
Set them in Vercel only if the website address changes.

## Checking the Gmail App Password
- Google side: myaccount.google.com/apppasswords lists every active App Password. If "school portal" is there, it is active. If it is missing, it was deleted: create a new one.
- Server side: approve a test application. If Gmail rejects the password, the admin toast says so in plain words.
- To replace it: delete the old one on that page, create a new one, paste it (no spaces) into GMAIL_APP_PASSWORD in Vercel, then Redeploy.

## Checking the server from a browser
- https://fullschoolapi.vercel.app/api/verify shows `{"ok":true,"service":"verify","paystackSecretKeySet":true}`
- https://fullschoolapi.vercel.app/api/send-credentials shows `gmailUserSet`, `gmailAppPasswordSet` and `nodemailerInstalled`, which should all be `true`.
Any `false` means that variable/package is missing: fix it and Redeploy.

## Logo and login button
The school logo is built into the email (lib/logo.js), so it shows without depending on any website.
Set `PORTAL_URL` in Vercel to your live website address (no slash at the end) so the login button goes to the right site.

## Payment receipts (api/paystack-webhook.js)
Paystack tells this server whenever a payment succeeds, even if the payer's phone lost network or closed the page. The server confirms the payment with Paystack, then emails a branded receipt (registration fee or school fees) to the email used for the payment.

Setup (do it for Test now, and again for Live later, they are separate):
1. Paystack dashboard > Settings > API Keys & Webhooks.
2. Webhook URL = `https://fullschoolapi.vercel.app/api/paystack-webhook` > Save.
3. Open that same address in a browser: it should show `secretKeySet` and `gmailSet` both `true`.

Optional Vercel variable: `RECEIPT_BCC` = a school address (e.g. the bursar) that also gets a copy of every receipt.

Notes: payments with a placeholder address (@newtownacademy.edu.ng, used when a student has no parent email) are skipped. Rarely, Paystack may deliver the same event twice, which would send a duplicate receipt.

## Which websites may call this server (ALLOWED_ORIGIN)
`https://enoche-001.github.io` is always allowed. To also allow your Vercel website, set `ALLOWED_ORIGIN` in Vercel to its address; for several sites separate them with commas, e.g.
`https://yourschool.vercel.app, https://another.vercel.app` (paths and trailing slashes are ignored). Redeploy after changing it.

## AI questions (api/ai-generate.js) – OpenRouter
Powers the AI Generator for teachers and admin. Only a signed-in admin or teacher can call it (same check style as send-credentials), max 40 requests/hour per user.

Setup:
1. Make an account at openrouter.ai, add some credit (Credits page) and create a key (Keys page).
2. Vercel > your project > Settings > Environment Variables:
   - `OPENROUTER_API_KEY` = the key (starts with `sk-or-`)
   - `OPENROUTER_MODEL` (optional) = any OpenRouter model id. Default `deepseek/deepseek-chat` (fast and cheap). For stronger maths/diagrams try a larger model, e.g. one of the Claude, GPT or Gemini models listed on openrouter.ai/models; if unsure, keep the default.
3. Upload this folder to the server repo (new file `api/ai-generate.js`, updated `vercel.json`), then Redeploy.
4. Check: open `https://fullschoolapi.vercel.app/api/ai-generate` in a browser. It should show `"openrouterKeySet": true`.

Notes: each request asks for at most 12 questions (the website sends batches of 6-10) so it finishes inside the time limit. If OpenRouter says the account is out of credit, the teacher sees a clear message; top up at openrouter.ai.
