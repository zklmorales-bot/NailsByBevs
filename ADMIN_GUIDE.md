Nails by Bevs Admin Guide
=========================

The booking system uses Supabase for the database, API, private reference-photo storage, and admin authentication.

System overview
---------------

- `Nails by Bevs2.html` is the public booking website.
- `admin.html` is the private custom admin page.
- Supabase PostgreSQL stores bookings and availability blocks.
- Supabase Edge Functions provide the public booking API and protected admin API.
- Supabase Storage keeps reference photos private.
- Resend sends confirmation emails after the admin confirms a booking.

Supabase setup
--------------

1. Create a free Supabase project.
2. Open the SQL Editor and run `supabase/schema.sql`.
3. Create an admin account in **Authentication > Users**.
4. Copy that user's UUID and run this SQL, replacing the values:

```sql
insert into public.admin_users (user_id, email)
values ('AUTH_USER_UUID', 'admin@example.com');
```

1. Deploy both Edge Functions:
   - `booking-api`
   - `admin-api`
1. Configure these Edge Function secrets:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`
   - `ADMIN_EMAIL`
   - `EMAIL_FROM`
1. Replace the Supabase placeholders in `Nails by Bevs2.html` and `admin.html`.
1. Deploy the updated static files to GitHub Pages or another free static host.

Never put the Supabase service-role key in either HTML file. Only the public URL and anonymous key belong in frontend files.

GitHub Pages setup
------------------

1. Push the project to a GitHub repository.
2. Open the repository on GitHub and go to **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the `main` branch and the `/ (root)` folder, then click **Save**.
5. Wait for deployment to finish. GitHub will show the public site URL on the Pages screen.
6. Open the site URL and test the public booking page.
7. Open `/admin.html` on the same site URL to access the protected admin page.

Before pushing, replace the frontend placeholders with the Supabase project URL and anonymous key. Never add the Supabase service-role key, Resend key, or other private secrets to the repository. GitHub Pages is public, but the admin page still requires Supabase authentication.

Bookings
--------

The admin page lists all requests. New requests start as `PENDING`.

1. Sign in at `admin.html`.
2. Review the date, time, service, contact information, and reference photos.
3. Click **Confirm** to approve the request.
4. The API locks that date/time as `CONFIRMED`.
5. The studio and customer receive confirmation emails when Resend is configured.

A confirmed slot cannot be confirmed for another booking. Other available status values are `REJECTED`, `CANCELLED`, and `COMPLETED`.

Availability
------------

Use the **Block availability** form on `admin.html` to block a slot or a full day.

- Weekdays: `09:00` and `21:00`
- Weekends: `09:00`, `11:00`, `16:00`, and `18:00`
- Use `All slots` to block the whole day.

Removing a block reopens the slot. The public calendar displays today plus the next 90 days. Change `DAYS_AHEAD` in the booking Edge Function if the window needs to change.

Reference photos
----------------

Customers can upload up to three images, each no larger than 5 MB. The browser compresses them before sending them to the booking API. The API stores them in the private `booking-references` bucket. The admin page generates temporary signed links for viewing them.

Email behavior
--------------

Submitting a request does not send an email. Emails are sent only after the admin confirms the booking. The studio email receives the private reference-photo links; the customer email does not.

If Resend is not configured, bookings still work and confirmation status still updates, but emails will not be delivered.

Troubleshooting
---------------

Calendar does not load
----------------------

- Confirm the booking Edge Function is deployed.
- Confirm `BOOKING_API_URL` in `Nails by Bevs2.html` points to the deployed function.
- Check the Supabase Edge Function logs.
- Confirm the SQL schema has been applied.

Admin login fails
-----------------

- Confirm the user exists in Supabase Authentication.
- Confirm the user's UUID exists in `public.admin_users`.
- Confirm `SUPABASE_ANON_KEY` and `SUPABASE_URL` in `admin.html` are correct.

Confirm button fails
--------------------

- Confirm the admin user is authenticated.
- Confirm the admin Edge Function is deployed.
- Check whether another booking already confirmed the same slot.
- Check Edge Function logs for database or email errors.

Reference photos do not appear
------------------------------

- Confirm the `booking-references` storage bucket exists.
- Confirm the admin user is listed in `admin_users`.
- Confirm the admin Edge Function has the service-role secret.
- Check that the uploaded files are no larger than 5 MB before compression.

Privacy
-------

Keep the Supabase service-role key and Resend API key in Supabase secrets only. Keep the database, admin page, and reference-photo bucket private. Do not expose service-role credentials in GitHub or HTML.
