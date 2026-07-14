# Twilio Verification — What You Must Do Tonight

> Internal checklist — safe to delete from the repo after verification passes.

**The deadline is for SUBMITTING the verification form (with your live domain in it) — the human review happens days later.** So tonight = get the site live on `yasminbeauty.salon`, make the 2 small content edits below, and fill in the Twilio form. The backend does NOT need to be deployed tonight; reviewers look at the opt-in form and privacy policy, they don't submit bookings.

---

## Step 1 — Put the site live on the real domain (~30 min, mostly DNS waiting)

1. Vercel dashboard → your project → **Settings → Domains** → add `yasminbeauty.salon` **and** `www.yasminbeauty.salon` (set one as redirect to the other — apex as primary is fine).
2. At your domain registrar, add the DNS records Vercel shows you (typically an `A` record on `@` → `76.76.21.21` and a `CNAME` on `www` → `cname.vercel-dns.com` — **use the exact values Vercel displays**, they vary).
3. Wait for Vercel to show the domain as valid; HTTPS certificate is automatic.
4. Verify on your phone: `https://yasminbeauty.salon`, `https://yasminbeauty.salon/book-appointment.html`, `https://yasminbeauty.salon/privacy-policy.html` all load.

The privacy policy already names `yasminbeauty.salon` as the Site (privacy-policy.html:119), so the domain you submit matches what the policy says. Good.

## Step 2 — Remove the placeholder image on the About page (2 min)

A grey third-party "Business Image" placeholder is the #1 "website under construction" signal to a reviewer.

**File:** `about.html:103-105`

Either delete the block:

```html
<div class="business-img">
    <img src="https://placehold.co/600x500?text=Business+Image" alt="Placeholder">
</div>
```

…or swap the `src` for one of your real salon photos already on Cloudinary, e.g.:

```html
<img src="https://res.cloudinary.com/yfmlabi1/image/upload/f_auto,q_auto,w_800/v1783755063/highlights_q6b9jo.jpg"
     alt="Hair styling work at Yasmin Beauty Salon">
```

## Step 3 — Strengthen the SMS consent checkbox wording (10 min)

**This is the single most common Toll-Free/A2P rejection reason:** the opt-in language at the point of collection must include frequency, rates, and STOP/HELP disclosures. Yours currently says only "I agree to receive SMS confirmations and reminders…".

Three places to edit (all the same sentence):

**`book-appointment.html:179-180`** — replace the label text with:

```html
<label for="consent-sms" data-i18n="form.consentSMS">I agree to receive SMS appointment
  confirmations, reminders, and scheduling updates from Yasmin Beauty Salon. Message frequency
  varies. Message &amp; data rates may apply. Reply STOP to opt out, HELP for help. Consent is
  not required to book. See our <a href="privacy-policy.html">Privacy Policy</a>.</label>
```

**`locales/en.json`** — key `form.consentSMS` (line 100), same text:

```json
"form.consentSMS": "I agree to receive SMS appointment confirmations, reminders, and scheduling updates from Yasmin Beauty Salon. Message frequency varies. Message & data rates may apply. Reply STOP to opt out, HELP for help. Consent is not required to book. See our <a href='privacy-policy.html'>Privacy Policy</a>."
```

**`locales/es.json`** — key `form.consentSMS`:

```json
"form.consentSMS": "Acepto recibir por SMS confirmaciones, recordatorios y avisos de cambios de cita de Yasmin Beauty Salon. La frecuencia de mensajes varía. Pueden aplicarse tarifas de mensajes y datos. Responde STOP para darte de baja o HELP para ayuda. El consentimiento no es obligatorio para reservar. Consulta nuestra <a href='privacy-policy.html'>Política de Privacidad</a>."
```

Things you already do RIGHT (don't touch): checkbox is **unchecked by default** ✓, consent is **optional to book** ✓ (also stated in privacy policy §04), STOP/HELP/frequency/rates all documented in privacy policy §04 ✓, Twilio named as processor ✓.

## Step 4 — Fill in the Twilio verification form (paste-ready answers)

Use the **same business identity everywhere** (form ↔ website): name "Yasmin Beauty Salon Unisex", address 2438 1st St, Los Angeles, CA 90033, phone (323) 907-5658, email yasminbeautysalon2024@gmail.com.

- **Business website:** `https://yasminbeauty.salon`
- **Opt-in type:** Web form
- **Opt-in / workflow description:**
  > Customers book appointments at https://yasminbeauty.salon/book-appointment.html. The booking form contains an unchecked checkbox where the customer may expressly consent to receive transactional SMS (appointment confirmations, reminders, and cancellation/reschedule notifications). Consent is not required to book. Disclosures for message frequency, message & data rates, STOP opt-out, and HELP are shown at the point of opt-in and in our privacy policy at https://yasminbeauty.salon/privacy-policy.html. No marketing messages are sent.
- **Opt-in proof:** after Step 3 is deployed, take a screenshot of the consent checkbox section on the live site, upload it to your Cloudinary media library, and paste that image URL (plus the live form URL) into the form.
- **Privacy policy URL:** `https://yasminbeauty.salon/privacy-policy.html`
- **Use case category:** Account Notifications / Appointment reminders (transactional)
- **Estimated monthly volume:** pick the lowest tier (e.g., under 1,000/month)
- **Sample messages** (include your brand name in every message; include opt-out language; links must use YOUR domain — never a URL shortener like bit.ly, that's an auto-reject):
  1. `Yasmin Beauty Salon: Hi {Name}, your {Service} appointment on {Date} at {Time} is booked. View, cancel or reschedule: https://yasminbeauty.salon/view-appointment.html?c={Code}. Reply STOP to opt out, HELP for help.`
  2. `Yasmin Beauty Salon: Reminder — your {Service} appointment is tomorrow at {Time}. 2438 1st St, Los Angeles. Reply STOP to opt out.`
  3. `Yasmin Beauty Salon: Your appointment on {Date} was canceled. Book again anytime: https://yasminbeauty.salon/book-appointment.html. Reply STOP to opt out.`

## Step 5 — Pre-submission sanity pass (5 min)

- [ ] All 5 pages load over HTTPS on the real domain (phone + laptop).
- [ ] Privacy Policy link in the footer works from every page.
- [ ] Consent checkbox shows the new wording (English AND toggle to Spanish).
- [ ] About page no longer shows the grey placeholder.
- [ ] Screenshot of the consent section saved + uploaded for the form.

## Known-acceptable while the backend is down

Clicking a date on the booking page will show "Couldn't load times. Please try again later." and submitting can't complete. That is a graceful failure and reviewers don't test bookings — but **get the backend deployed before the review actually happens** (typically 1–5 business days after submission) so the site is fully working if they click around. The frontend fixes required for that moment are in `NeededFixesInFrontendBeforeLiveBackend.md`.

## If the form asks (A2P 10DLC brand registration only)

- Sole proprietor registration needs your personal name + mobile number for OTP verification.
- Standard brand registration needs an EIN that matches your legal business name exactly (IRS records, not the DBA).
- These are Twilio-console tasks, nothing on the website.
