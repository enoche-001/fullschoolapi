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
