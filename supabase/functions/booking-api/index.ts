import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const DAYS_AHEAD = 90;
const BASE_SERVICES = ['Soft Gel Nail Extensions', 'Gel Polish'];
const ADD_ON_SERVICES = [
  'Chrome / Cat Eye / Glitter',
  'French Tip',
  'Charms / Stones / Pearl',
  '3D Design / Embossed',
  'Aura / Ombre',
  'Nail Art'
];
const REMOVAL_SOURCES = ['My work', 'Not my work'];
const REMOVAL_SERVICES = ['Soft Gel', 'Gel'];

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

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function slotLabels(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6 ? ['09:00', '13:00', '17:00'] : ['09:00', '21:00'];
}

async function getAvailability() {
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + DAYS_AHEAD);

  const [{ data: confirmed, error: confirmedError }, { data: blocks, error: blockError }] = await Promise.all([
    supabase.from('bookings').select('preferred_date, preferred_time').eq('status', 'CONFIRMED')
      .gte('preferred_date', dateKey(today)).lte('preferred_date', dateKey(end)),
    supabase.from('availability_blocks').select('block_date, block_time, status')
      .eq('status', 'BLOCKED').gte('block_date', dateKey(today)).lte('block_date', dateKey(end))
  ]);

  if (confirmedError || blockError) throw new Error('Availability query failed');

  const unavailable = new Set<string>();
  (confirmed ?? []).forEach((row) => unavailable.add(`${row.preferred_date}|${String(row.preferred_time).slice(0, 5)}`));
  (blocks ?? []).forEach((row) => unavailable.add(`${row.block_date}|${row.block_time}`));

  const days = [];
  for (let offset = 0; offset <= DAYS_AHEAD; offset += 1) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() + offset);
    const key = dateKey(date);
    const slots = slotLabels(key).map((time) => ({
      time,
      available: !unavailable.has(`${key}|${time}`) && !unavailable.has(`${key}|ALL`)
    }));
    days.push({ date: key, available: slots.some((slot) => slot.available), slots });
  }
  return days;
}

function parseAddons(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((addon) => {
    const item = addon as { name?: unknown; quantity?: unknown };
    const name = String(item.name ?? '').trim();
    const quantity = Number(item.quantity);
    if (!ADD_ON_SERVICES.includes(name) || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      throw new Error('Invalid add-on');
    }
    return { name, quantity };
  });
}

function validateBooking(data: Record<string, unknown>) {
  const baseService = String(data.baseService ?? '').trim();
  const removalSource = String(data.removalSource ?? '').trim();
  const removalService = String(data.removalService ?? '').trim();
  const addons = parseAddons(data.addons);
  const email = String(data.email ?? '').trim();
  const phone = String(data.phone ?? '').trim();
  const instagramHandle = String(data.instagramHandle ?? '').trim();

  if (!BASE_SERVICES.includes(baseService)) throw new Error('A valid base service is required');
  if (addons.length && !baseService) throw new Error('Add-ons require a base service');
  if ((removalSource || removalService) && (!REMOVAL_SOURCES.includes(removalSource) || !REMOVAL_SERVICES.includes(removalService))) {
    throw new Error('Removal source and type must be selected together');
  }
  
  // Made email validation conditional so bookings CAN be created without an email 
  // (which triggers your Requirement 4: popup to call them manually)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A valid email is required if provided');
  }
  if (!instagramHandle) {
    throw new Error('An Instagram or TikTok username or link is required');
  }

  const parts = [baseService, ...addons.map((addon) => `${addon.name} x${addon.quantity}`)];
  if (removalSource) parts.push(`Removal - ${removalSource} - ${removalService}`);

  return {
    baseService,
    removalSource: removalSource || null,
    removalService: removalService || null,
    addons,
    email: email || null,
    phone: phone || null,
    instagramHandle,
    summary: parts.join(' + '),
    bookingType: removalSource ? 'BASE_AND_REMOVAL' : 'BASE'
  };
}

async function uploadReferences(encodedImages: unknown, customerName: string) {
  if (!encodedImages) return [];
  let images: unknown[];
  try {
    images = Array.isArray(encodedImages)
      ? encodedImages
      : (typeof encodedImages === 'string' && encodedImages.trim() ? JSON.parse(encodedImages) : []);
  } catch {
    throw new Error('Invalid reference images data');
  }
  if (!Array.isArray(images) || images.length > 3) throw new Error('Up to three images are allowed');
  if (images.length === 0) return [];
  const safeName = customerName.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 50) || 'customer';
  const paths: string[] = [];

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    if (image.type !== 'image/jpeg' || !String(image.data).startsWith('data:image/jpeg;base64,')) throw new Error('Invalid image');
    const bytes = Uint8Array.from(atob(String(image.data).split(',')[1]), (char) => char.charCodeAt(0));
    const path = `${new Date().toISOString().slice(0, 10)}/${safeName}-${crypto.randomUUID()}-${index + 1}.jpg`;
    const { error } = await supabase.storage.from('booking-references').upload(path, bytes, {
      contentType: 'image/jpeg',
      upsert: false
    });
    if (error) throw error;
    paths.push(path);
  }
  return paths;
}

async function sendNewBookingEmail(booking: any) {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    console.warn('RESEND_API_KEY is not set. Skipping new booking email notification.');
    return;
  }

  const emailBody = `
    <h2>✨ New Booking Request</h2>
    <p><strong>Name:</strong> ${booking.full_name}</p>
    <p><strong>Instagram / TikTok:</strong> ${booking.instagram_handle || 'Not provided'}</p>
    <p><strong>Email:</strong> ${booking.email || 'Not provided'}</p>
    <p><strong>Phone:</strong> ${booking.phone || 'Not provided'}</p>
    <p><strong>Date:</strong> ${booking.preferred_date}</p>
    <p><strong>Time:</strong> ${booking.preferred_time}</p>
    <p><strong>Service Summary:</strong> ${booking.service_summary}</p>
    <hr/>
    <p>Please log in to your admin dashboard to confirm or reject this booking.</p>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Nail Studio <onboarding@resend.dev>', // TODO: Replace with your verified Resend domain (e.g., 'Nail Studio <bookings@yourdomain.com>')
        to: ['nailsbybevs@gmail.com'],
        subject: `New Booking: ${booking.full_name} - ${booking.preferred_date} ${booking.preferred_time}`,
        html: emailBody,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Resend API error:', errorData);
    }
  } catch (error) {
    console.error('Failed to send new booking email:', error);
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (request.method === 'GET') return json({ ok: true, days: await getAvailability() });
    if (request.method !== 'POST') return json({ ok: false, message: 'Method not allowed' }, 405);

    const data = await request.json();
    const service = validateBooking(data);
    const date = String(data.date ?? '');
    const time = String(data.time ?? '').slice(0, 5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !slotLabels(date).includes(time)) throw new Error('Invalid date or time slot');

    const availability = await getAvailability();
    const day = availability.find((item) => item.date === date);
    const slot = day?.slots.find((item) => item.time === time);
    if (!slot?.available) throw new Error('That time slot is no longer available');

    const referencePaths = await uploadReferences(data.referenceImages, String(data.name ?? 'customer'));
    
    // Added .select().single() to get the newly created booking data back for the email
    const { data: newBooking, error } = await supabase.from('bookings').insert({
      full_name: String(data.name ?? '').trim(),
      email: service.email,
      phone: service.phone,
      instagram_handle: service.instagramHandle,
      preferred_date: date,
      preferred_time: time,
      service_summary: service.summary,
      booking_type: service.bookingType,
      base_service: service.baseService,
      addons: service.addons,
      removal_source: service.removalSource,
      removal_service: service.removalService,
      reference_image_paths: referencePaths,
      status: 'PENDING'
    }).select().single();
    
    if (error) throw error;

    // Trigger the email notification to the admin
    await sendNewBookingEmail(newBooking);

    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, message: error instanceof Error ? error.message : 'Request failed' }, 400);
  }
});