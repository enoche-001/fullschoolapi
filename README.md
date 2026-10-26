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
