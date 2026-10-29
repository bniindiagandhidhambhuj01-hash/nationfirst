# Nation First Seating Manager

The app can run as a static page, but shared bookings require a Vercel deployment and an Upstash Redis database. Booking names, pass numbers, event details, and seat availability are visible and editable to anyone with the app link. Guest phone numbers are only returned to an organizer signed in with the organizer PIN.

## Floor planner

The interactive floor plan starts with 24 two-seat sofas and 56 six-seat tables. Switch between the complete, sofa, and table views; zoom, select, and edit furniture; or restore the original arrangement. Layout changes and seat-count settings are saved in the current browser. PNG and summary downloads reflect the current layout. Use **PDF / Print** to print the floor plan or save it as a PDF from the browser’s print dialog.

Floor-plan edits are separate from guest bookings, which continue to use the original 24-sofa and 56-table booking inventory. Shared bookings still require the Vercel and Upstash setup below.

## Configure shared storage

1. Import this repository into Vercel and deploy it.
2. In the Vercel project, create an Upstash Redis database from the Storage/Marketplace integrations and connect it to the project.
3. Add these environment variables for Production and Preview:
   - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (provided by Upstash).
   - `ORGANIZER_PIN` (a strong, private PIN for phone-number access).
   - `ORGANIZER_SESSION_SECRET` (a random secret of at least 32 characters).
4. Redeploy after setting environment variables.

You can generate a session secret with `openssl rand -hex 32`. Never put credentials in the repository or share the organizer PIN publicly.

Once deployed, open the Vercel URL. The app will show whether it is connected to shared storage. On an existing browser that has locally saved bookings with phone numbers, sign in as the organizer before migration; unsigned-in users cannot migrate phone numbers. Changes are saved to Redis and other open pages refresh about every 10 seconds. Concurrent edits are detected; refresh the page and reapply a change if the app reports a conflict.

## Local development

Install dependencies with `npm install`. Run the app through Vercel's local development server (`vercel dev`) with the same environment variables configured; opening `index.html` directly or serving it as a static file does not provide shared storage. If the page says an API endpoint returned HTML instead of JSON, it is being served statically; use `vercel dev` or the deployed Vercel URL for shared bookings.
