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

async function sendUserConfirmationEmail(booking: Record<string, unknown>) {
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) return { sent: false, missing: false };

  const userEmail = booking.email as string | null | undefined;
  if (!userEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
    return { sent: false, missing: true }; // Triggers Requirement 4
  }

  const message = {
    to: [userEmail],
    subject: 'Your Nails by Bevs appointment is confirmed! 💅',
    html: `
      <h2>Hi ${booking.full_name},</h2>
      <p>Your appointment has been confirmed! We can't wait to see you.</p>
      <h3>Appointment Details:</h3>
      <ul>
        <li><strong>Date:</strong> ${booking.preferred_date}</li>
        <li><strong>Time:</strong> ${String(booking.preferred_time).slice(0, 5)}</li>
        <li><strong>Service:</strong> ${booking.service_summary}</li>
      </ul>
      <p>If you need to make any changes, please reply to this email or contact us.</p>
      <p>Best regards,<br>Nails by Bevs</p>
    `
  };

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        from: Deno.env.get('EMAIL_FROM') || 'Nails by Bevs <onboarding@resend.dev>', 
        ...message 
      })
    });
    if (!response.ok) {
      console.error('Resend API error:', await response.text());
      return { sent: false, missing: false };
    }
    return { sent: true, missing: false };
  } catch (error) {
    console.error('Failed to send confirmation email:', error);
    return { sent: false, missing: false };
  }
}

async function sendUserRejectionEmail(booking: Record<string, unknown>, adminNote?: string | null) {
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) return { sent: false, missing: false };

  const userEmail = booking.email as string | null | undefined;
  if (!userEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
    return { sent: false, missing: true }; // Triggers Requirement 4
  }

  const noteText = adminNote 
    ? `<p><strong>Reason / Next Steps:</strong> ${adminNote}</p>` 
    : '<p>Please contact us to discuss alternative dates or services.</p>';

  const message = {
    to: [userEmail],
    subject: 'Update regarding your Nails by Bevs appointment',
    html: `
      <h2>Hi ${booking.full_name},</h2>
      <p>Thank you for your booking request. Unfortunately, we are unable to confirm your appointment for <strong>${booking.preferred_date}</strong> at <strong>${String(booking.preferred_time).slice(0, 5)}</strong>.</p>
      ${noteText}
      <p>We apologize for any inconvenience. Please feel free to reach out to book a different time or if you have any questions.</p>
      <p>Best regards,<br>Nails by Bevs</p>
    `
  };

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        from: Deno.env.get('EMAIL_FROM') || 'Nails by Bevs <onboarding@resend.dev>', 
        ...message 
      })
    });
    if (!response.ok) {
      console.error('Resend API error:', await response.text());
      return { sent: false, missing: false };
    }
    return { sent: true, missing: false };
  } catch (error) {
    console.error('Failed to send rejection email:', error);
    return { sent: false, missing: false };
  }
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
      
      const emailResult = await sendUserConfirmationEmail(enriched);
      
      if (emailResult.sent) {
        await supabase.from('bookings').update({ confirmation_sent_at: new Date().toISOString() }).eq('id', body.id);
      }
      
      return json({ 
        ok: true, 
        booking: enriched, 
        emailSent: emailResult.sent,
        emailMissing: emailResult.missing 
      });
    }

    if (body.action === 'status') {
      const allowed = ['REJECTED', 'CANCELLED', 'COMPLETED', 'PENDING'];
      if (!allowed.includes(body.status)) throw new Error('Invalid status');
      
      const { data: booking, error: fetchError } = await supabase.from('bookings').select('*').eq('id', body.id).single();
      if (fetchError) throw fetchError;

      const { error } = await supabase.from('bookings').update({ status: body.status, admin_note: body.adminNote ?? null }).eq('id', body.id);
      if (error) throw error;

      let emailResult = { sent: false, missing: false };
      if (body.status === 'REJECTED' || body.status === 'CANCELLED') {
        emailResult = await sendUserRejectionEmail(booking, body.adminNote);
      }

      return json({ 
        ok: true, 
        emailSent: emailResult.sent,
        emailMissing: emailResult.missing 
      });
    }

    if (body.action === 'block') {
      const dates: string[] = Array.isArray(body.dates) && body.dates.length > 0
        ? body.dates
        : (body.date ? [body.date] : []);
      if (!dates.length) throw new Error('At least one date is required');
      const time = String(body.time || 'ALL');
      const note = body.note ? String(body.note).trim() : null;
      const rows = dates.map((d) => ({
        block_date: d,
        block_time: time,
        status: 'BLOCKED',
        admin_note: note
      }));
      const { error } = await supabase.from('availability_blocks').upsert(rows, { onConflict: 'block_date,block_time' });
      if (error) throw error;
      return json({ ok: true, count: rows.length });
    }

    if (body.action === 'unblock') {
      const ids: string[] = Array.isArray(body.ids)
        ? body.ids
        : (body.id ? [body.id] : []);
      if (!ids.length) throw new Error('Block ID is required');
      const { error } = await supabase.from('availability_blocks').delete().in('id', ids);
      if (error) throw error;
      return json({ ok: true, count: ids.length });
    }

    if (body.action === 'delete') {
      if (!body.id) throw new Error('Booking ID is required');
      const { data: booking, error: fetchError } = await supabase
        .from('bookings')
        .select('reference_image_paths')
        .eq('id', body.id)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (booking?.reference_image_paths && booking.reference_image_paths.length > 0) {
        await supabase.storage.from('booking-references').remove(booking.reference_image_paths);
      }
      const { error } = await supabase.from('bookings').delete().eq('id', body.id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === 'bulk_delete') {
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (!ids.length) throw new Error('No IDs provided');
      const { data: bookings } = await supabase
        .from('bookings')
        .select('reference_image_paths')
        .in('id', ids);
      const allImages = (bookings ?? []).flatMap((b) => b.reference_image_paths ?? []);
      if (allImages.length > 0) {
        await supabase.storage.from('booking-references').remove(allImages);
      }
      const { error } = await supabase.from('bookings').delete().in('id', ids);
      if (error) throw error;
      return json({ ok: true, count: ids.length });
    }

    if (body.action === 'bulk_status') {
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (!ids.length) throw new Error('No IDs provided');
      const allowed = ['REJECTED', 'CANCELLED', 'COMPLETED', 'PENDING'];
      if (!allowed.includes(body.status)) throw new Error('Invalid status');
      
      const { data: bookings, error: fetchError } = await supabase.from('bookings').select('*').in('id', ids);
      if (fetchError) throw fetchError;

      const { error } = await supabase
        .from('bookings')
        .update({ status: body.status, admin_note: body.adminNote ?? null })
        .in('id', ids);
      if (error) throw error;

      let missingEmails: string[] = [];
      if (body.status === 'REJECTED' || body.status === 'CANCELLED') {
        for (const booking of bookings) {
          const emailResult = await sendUserRejectionEmail(booking, body.adminNote);
          if (emailResult.missing) {
            missingEmails.push(booking.id);
          }
        }
      }

      return json({ ok: true, count: ids.length, missingEmails });
    }

    if (body.action === 'bulk_confirm') {
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (!ids.length) throw new Error('No IDs provided');
      const confirmedIds: string[] = [];
      const failed: { id: string; reason: string }[] = [];
      const missingEmails: string[] = [];

      for (const id of ids) {
        try {
          const { data: booking, error: rpcError } = await supabase.rpc('confirm_booking', { p_booking_id: id }).single();
          if (rpcError) {
            failed.push({ id, reason: rpcError.message });
            continue;
          }
          const enriched = { ...booking, reference_urls: await signedReferenceUrls(booking.reference_image_paths ?? []) };
          const emailResult = await sendUserConfirmationEmail(enriched);
          if (emailResult.sent) {
            await supabase.from('bookings').update({ confirmation_sent_at: new Date().toISOString() }).eq('id', id);
          }
          if (emailResult.missing) {
            missingEmails.push(id);
          }
          confirmedIds.push(id);
        } catch (err) {
          failed.push({ id, reason: err instanceof Error ? err.message : 'Unknown confirmation error' });
        }
      }
      return json({ ok: true, confirmedCount: confirmedIds.length, failed, missingEmails });
    }

    throw new Error('Unknown admin action');
  } catch (error) {
    return json({ ok: false, message: error instanceof Error ? error.message : 'Admin request failed' }, 400);
  }
});