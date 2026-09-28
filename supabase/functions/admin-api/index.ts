import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function requireAdmin(request: Request) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Authentication required');
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Authentication required');
  const { data: admin, error } = await supabase.from('admin_users').select('user_id').eq('user_id', userData.user.id).maybeSingle();
  if (error || !admin) throw new Error('Admin access required');
  return userData.user;
}

async function signedReferenceUrls(paths: string[]) {
  return (await Promise.all(paths.map(async (path) => {
    const { data } = await supabase.storage.from('booking-references').createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  }))).filter(Boolean);
}

async function loadBookings() {
  const { data, error } = await supabase.from('bookings').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return Promise.all((data ?? []).map(async (booking) => ({
    ...booking,
    reference_urls: await signedReferenceUrls(booking.reference_image_paths ?? [])
  })));
}

async function sendConfirmationEmail(booking: Record<string, unknown>) {
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const adminEmail = Deno.env.get('ADMIN_EMAIL');
  if (!resendKey || !adminEmail) return false;

  const references = ((booking.reference_urls as string[] | undefined) ?? []).join('\n') || 'None';
  const details = [
    `Name: ${booking.full_name}`,
    `Email: ${booking.email}`,
    `Phone: ${booking.phone || 'Not provided'}`,
    `Date: ${booking.preferred_date}`,
    `Time: ${String(booking.preferred_time).slice(0, 5)}`,
    `Service: ${booking.service_summary}`,
    `Reference photos: ${references}`
  ].join('\n');

  const messages = [
    {
      to: [adminEmail],
      subject: 'Nails by Bevs booking confirmed',
      text: `A booking was confirmed.\n\n${details}`
    },
    {
      to: [String(booking.email)],
      subject: 'Your Nails by Bevs appointment is confirmed',
      text: `Hi ${booking.full_name},\n\nYour appointment has been confirmed.\n\n${details.replace(`Reference photos: ${references}`, '')}\n\nNails by Bevs`
    }
  ];

  for (const message of messages) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: Deno.env.get('EMAIL_FROM') || 'Nails by Bevs <onboarding@resend.dev>', ...message })
    });
    if (!response.ok) throw new Error('Email delivery failed');
  }
  return true;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    await requireAdmin(request);
    if (request.method === 'GET') {
      const [bookings, blocks] = await Promise.all([
        loadBookings(),
        supabase.from('availability_blocks').select('*').order('block_date').then((result) => {
          if (result.error) throw result.error;
          return result.data ?? [];
        })
      ]);
      return json({ ok: true, bookings, blocks });
    }

    const body = await request.json();
    if (body.action === 'confirm') {
      const { data: booking, error } = await supabase.rpc('confirm_booking', { p_booking_id: body.id }).single();
      if (error) throw error;
      const enriched = { ...booking, reference_urls: await signedReferenceUrls(booking.reference_image_paths ?? []) };
      const emailSent = await sendConfirmationEmail(enriched);
      if (emailSent) {
        await supabase.from('bookings').update({ confirmation_sent_at: new Date().toISOString() }).eq('id', body.id);
      }
      return json({ ok: true, booking: enriched, emailSent });
    }

    if (body.action === 'status') {
      const allowed = ['REJECTED', 'CANCELLED', 'COMPLETED', 'PENDING'];
      if (!allowed.includes(body.status)) throw new Error('Invalid status');
      const { error } = await supabase.from('bookings').update({ status: body.status, admin_note: body.adminNote ?? null }).eq('id', body.id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === 'block') {
      const { error } = await supabase.from('availability_blocks').upsert({
        block_date: body.date,
        block_time: body.time,
        status: 'BLOCKED',
        admin_note: body.note ?? null
      }, { onConflict: 'block_date,block_time' });
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === 'unblock') {
      const { error } = await supabase.from('availability_blocks').delete().eq('id', body.id);
      if (error) throw error;
      return json({ ok: true });
    }

    throw new Error('Unknown admin action');
  } catch (error) {
    return json({ ok: false, message: error instanceof Error ? error.message : 'Admin request failed' }, 400);
  }
});
