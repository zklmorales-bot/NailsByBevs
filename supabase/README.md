Supabase backend
=================

This folder contains the database schema and Edge Functions for Nails by Bevs.

Functions
---------

- `booking-api`: public availability and booking submission endpoint.
- `admin-api`: authenticated admin dashboard endpoint for confirmations and blocks.

Local Supabase CLI workflow
---------------------------

Install the Supabase CLI, log in, link this project, and apply the schema:

```text
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy booking-api
supabase functions deploy admin-api
```

Set function secrets in the Supabase dashboard or CLI. Required values:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
ADMIN_EMAIL
EMAIL_FROM
```

The service-role key must only exist in Supabase function secrets. It must never be committed or placed in `Nails-by-Bevs.html` or `admin.html`.
