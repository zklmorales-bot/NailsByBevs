Nails by Bevs
=============

Nails by Bevs is a polished, mobile-friendly website for a private nail studio in Quezon City, Metro Manila.

The site presents the studio's services, pricing, recent nail-art work, location, hours, and contact details in an elegant blush and oxblood visual style. Its main customer workflow is a booking request form where clients can choose a service, preferred date, preferred time, and provide their contact information.

The frontend is built with plain HTML, CSS, and JavaScript so it can be hosted for free as a static website. Booking requests are sent to a Supabase Edge Function and stored in a Supabase PostgreSQL database for the studio to review through a custom admin page. Reference photos are stored in private Supabase Storage. There is no payment processing; appointments are requested first and confirmed by the studio.

## Updating the "Recent sets" gallery

The gallery is driven by the `images/gallery/` folder:

1. Add, rename, or delete photo files (`.jpg`, `.jpeg`, `.png`, `.webp`) in `images/gallery/`.
2. Run:

   ```
   npm run gallery
   ```

   (or `node update-gallery.mjs`)

3. Done — `Nails-by-Bevs.html` is regenerated to show exactly what is in the folder, sorted by filename.

The page handles the rest automatically: photos display in a 3×2 grid (2 columns on mobile), show 6 per page with subtle dot navigation when there are more than 6, and open in a full-screen lightbox when clicked (close with ×, Escape, or a click on the background; browse with the ‹ › arrows or keyboard arrow keys).

### Tips

- **Ordering:** files are shown alphabetically, so prefix them with numbers to control order: `01-...`, `02-...`
- **Captions:** the caption comes from the filename: `01-oxblood-chrome.jpg` shows as "Oxblood chrome". Camera names like `IMG_1234.jpg` or `image_67131649.jpg` intentionally get no caption — rename the file to give it one.
- **Size:** resize photos to ~1200px wide before adding them; several-megabyte phone photos make the page slow to load.
