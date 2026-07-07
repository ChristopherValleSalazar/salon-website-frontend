# Yasmin Beauty Salon — Full Audit & Roadmap

Full analysis of `salon-website-frontend` and `salon-website-backend`, severity-ranked so the hardest problems get tackled first. Includes a review of the SMS-consent refactor plan and a realistic path to a live URL by end of week.

**TL;DR verdict:** The design and palette are genuinely solid for a salon site, and the backend architecture (JWT magic links, pessimistic locking, validation exceptions) is more thoughtful than most first versions. But the site cannot ship today: the booking form is not connected to the backend at all, every SMS is sent to one hardcoded phone number instead of the customer, the page the SMS links to doesn't exist, and three different domains are configured in three different places. Your SMS-consent plan is the right direction — do it first, because Twilio's re-review has multi-day latency you can't control.

---

## 🔴 CRITICAL — launch blockers (fix these first)

### C1. The booking form is not wired to the backend
`js/book-appointment.js:80-107` — the submit handler always calls `modalBehaviour()` (the success modal). There is no `fetch`, no error branch, no API base URL anywhere in the frontend. Every "booking" today is fake.

On top of the missing fetch, the form fields don't match `AppointmentRequest`:

| Form (`book-appointment.html`) | Backend DTO expects |
|---|---|
| `clientName` | `name` |
| `clientPhone` | `phoneNumber` |
| `service` | `serviceType` |
| `notes` | `additionalNotes` |
| `consentSMS` (checkbox → `"on"`) | `smsConsent` (Boolean) |
| single flatpickr value `"2026-07-15 10:00"` | `date` (`"2026-07-15"`) + `startTime` (`"10:00"`) |

**Fix:** build a JSON payload explicitly (don't post raw `FormData`), split the flatpickr value into `date`/`startTime`, and add a small config for the API base URL (e.g. a `const API_BASE` you can swap between localhost and production). Wire the failure modal to the backend's `{type, error}` response shape — the plumbing for that already exists in `failureModalBehaviour`.

### C2. All SMS go to a hardcoded number, not the customer
`TwilioService.java:60` — `Message.creator(TO_NUMBER, FROM_NUMER, ...)` sends every message to the `TWILIO_TO_NUMBER` env var. In production, every customer's magic link (which grants control of their appointment) would be texted to whatever number is in that config. This is both a broken feature and a privacy leak. The customer's phone number is on the `Appointment` entity but is never passed to `SmsService`/`TwilioService` at all.

**Fix:** thread `appointment.getPhoneNumber()` through `scheduleSmsMagicLink` / `appointmentReminder` / `cancellationOrConfirmation` and use it as the `to` number. Keep `TWILIO_TO_NUMBER` only for a dev/test profile if you want.

### C3. SMS consent is forced — the exact Twilio rejection
Three places enforce it:
1. `AppointmentRequest.java:18` — `@NotNull @AssertTrue Boolean smsConsent`
2. `book-appointment.html:168` — `<input type="checkbox" id="consentSMS" ... required>`
3. `locales/en.json` `form.consentSMS` — label copy with required asterisk

Meanwhile `privacy-policy.html` §04 states *"SMS consent is never required to book an appointment."* That contradiction between your policy and your form is precisely what a Twilio compliance reviewer checks. Your Workstream B fixes this — see the plan review below.

**Also required for approval:** put the compliance disclosure next to the checkbox itself, not only in the policy: *"Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help."*

### C4. `view-appointment.html` doesn't exist, but SMS links point to it
`TwilioService.java:41,52` link to `https://yasmin-salon-seven.vercel.app/view-appointment.html?token=...`. That page is not in the repo. Every confirmation/reminder SMS would deliver a 404. Your Workstream B items 11–16 build this page — it's a hard blocker, not an enhancement.

### C5. Domain chaos — three different domains in three places
- CORS (`SecurityConfig.java:48-51`): allows `https://yasmin-salon.vercel.app` and `http://chris-fedora:5501`
- SMS links (`TwilioService.java`): `https://yasmin-salon-seven.vercel.app`
- Privacy policy: claims the site lives at `yasminbeauty.salon`

If the frontend actually deploys to `yasmin-salon-seven.vercel.app`, **every API call is blocked by CORS** and nothing works. Pick the canonical production domain, use it in all three places, and move the URL + allowed origins into env vars/config so this can't drift again. (`chris-fedora:5501` is your dev machine's hostname — replace with `http://localhost:5501` / `http://127.0.0.1:5501` for dev, and ideally keep dev origins out of the prod config.)

### C6. Appointment reminders are fundamentally broken
`SmsService.java:21` — `private static final Instant twoMinutesFromNow = Instant.now().plus(1, ChronoUnit.HOURS);` is a **static field evaluated once at class load**. Consequences:
- Every reminder is scheduled for "server startup + 1 hour", regardless of the appointment date.
- Once the server has been up for over an hour, that instant is in the past, so reminders fire **immediately** — the customer gets "Reminder! You have an appointment tomorrow" seconds after booking.
- `ThreadPoolTaskScheduler` is in-memory: every deploy/restart (constant on free hosting tiers) silently drops all pending reminders.

**Fix:** don't schedule reminders in application memory at all. Two robust options:
1. **Twilio message scheduling** — create the message with `sendAt` (up to 35 days out, min 15 min ahead); Twilio holds it, restarts don't matter.
2. **DB-backed sweep** — a `@Scheduled` cron job (e.g. hourly) that queries appointments happening in ~24h whose reminder hasn't been sent, sends, and marks a `reminderSentAt` column.

Option 2 is free-tier friendly and survives everything. Either way, delete the static field.

### C7. `STRAIGHTENING` service doesn't exist in the backend
`book-appointment.html:116` and `index.html:284` use `data-service="STRAIGHTENING"` / `<option value="STRAIGHTENING">`, but `ServiceType` has `KERATIN_TREATMENT`. Jackson will fail to deserialize the enum → 400 error → nobody can ever book a keratin treatment. Change both frontend values to `KERATIN_TREATMENT`.

### C8. Six services are unbookable: image is required but upload doesn't exist
`AppointmentService.java:49` requires `hairImageUrl` for DYES, BABY_HIGHLIGHT, COLOR_TOUCH_UP, TREATMENT_MOISTURIZING, KERATIN_TREATMENT, PERM. The form has a file input, but nothing uploads the file anywhere and the backend accepts only a URL string. There is no storage service in the stack. As-is, six of your fourteen services can never be booked.

**Decide now (recommendation: option A for Friday):**
- **A.** Make the image optional server-side for v1 (drop the `MissingHairImageException` check, keep the field), hide or de-emphasize the file input, let customers describe color history in notes. Ship.
- **B.** Add real upload (Cloudinary free tier is the least-effort fit: unsigned upload preset from the browser, store the returned URL in `hairImageUrl`). This is a day of work by itself — don't let it block the launch.

---

## 🟠 HIGH — fix before or immediately after launch

### H1. The owner has no way to see appointments
`appointments-owner.html` is an empty 1-line file; there are no admin endpoints; `spring.security.user.name/password` is configured but no auth mechanism (httpBasic/formLogin) is enabled, so nothing can ever authenticate as admin. The only reason the owner currently "finds out" about bookings is the C2 bug texting everything to one number. For launch week, the salon needs at minimum a daily appointment list — even a Basic-Auth-protected `GET /api/v1/appointments/admin?date=` plus a plain HTML table is enough. Slot it right after Workstream B.

### H2. Backend tests don't compile
`AppointmentServiceTest.java:182,206,229` mock `repo.findByDate(...)`, which no longer exists (`AppointmentRepo` has `findByDateForUpdate`). The Monday test also expects `SlotUnavailableException` but the service throws `SlotIsMondayException` (not a subclass). `mvn test` fails at compilation, so you currently have zero working verification. Fix the tests before the refactor — they're your safety net for B1–B5.

### H3. Reschedule flow has no cutoff check and a status leak
`AppointmentService.rescheduleAppointment()`:
- Never calls `validateAppointmentBeforeSms` → customers can reschedule 1 minute before the appointment, while cancel/confirm enforces a 2-hour cutoff.
- Never checks the current status → a CANCELED... (actually the JwtFilter blocks non-BOOKED/CONFIRMED, see H4 — but that protection lives in the wrong layer; the service should validate its own invariants).
- `smsService.scheduleSmsMagicLink(...)` runs inside the `@Transactional` method — if the transaction rolls back after scheduling, the customer receives a magic link to an appointment that was never saved. Move SMS side effects after commit (same pattern you already use in the controller for booking).

### H4. Invalid-status magic links die as bodyless 403s
`JwtFilter.java:65` only authenticates BOOKED/CONFIRMED appointments. For a CANCELED/RESCHEDULED/COMPLETED appointment, the filter sets no authentication and Spring returns a bare 403 — the view page can't distinguish "link used up" from "server broken". Write the same JSON error shape (`{"type":"AppointmentInactive", ...}`) that you already do for expired/invalid tokens. This matters for B15 (view page error states).

### H5. Business-hours mismatch between frontend, backend, and reality
- Backend: opens **9:00** (`OPENING_TIME`), closes 19:00, Sunday 15:00.
- Site copy + flatpickr: opens **10:00**, last slot 18:30, Sunday max 15:00.
- Sunday: flatpickr allows picking a 15:00 start, which the backend always rejects (any service would end past close).
Decide the real hours once, then align `AppointmentService`, the flatpickr config, and the printed opening-times table. Your Workstream A (available slots) will mostly obsolete the flatpickr min/max hack — the backend becomes the single source of truth. That's the right call.

### H6. Tokens and PII in logs
- `SmsService.java:32` logs the full magic-link JWT at INFO — anyone with log access can hijack any appointment.
- `AppointmentService.java:102,105` echo the raw phone number into exception messages (which go to the client response *and* logs).
- `TwilioService.java:65` `System.out.println(message.getBody())` prints full SMS content.
- `spring.jpa.show-sql=true` prints every row (names, phones) to stdout.
Log appointment IDs, never tokens or phone numbers. Turn off `show-sql` for prod.

### H7. Deployment config not production-ready
- `spring.jpa.hibernate.ddl-auto=update` — acceptable for v1 with Neon, but plan to move to `validate` + a migration tool (Flyway) once real customer data exists; `update` can silently mangle a live schema.
- `pom.xml` targets **Java 25** with Spring Boot **4.1.0** — bleeding edge. Verify your host (Render/Railway/Fly) actually offers a Java 25 runtime before Friday; this environment only has Java 21 and the project won't build here. If the host doesn't, downgrading the `java.version` property is trivial now and painful on deploy night.
- CORS: `allowCredentials(true)` with `AllowedHeaders("*")` — you use Bearer headers, not cookies; set `allowCredentials(false)` and list the headers you need (`Content-Type`, `Authorization`).
- Actuator is on the classpath; `anyRequest().authenticated()` covers it, but since no auth mechanism exists, health checks also fail — explicitly `permitAll` on `/actuator/health` so your host's health probe works.

### H8. `burger.js` outside-click is broken and leaks listeners
`burger.js:9` — `event.target.closest(burgerMenu)` passes a DOM element to `closest()`, which requires a selector string → throws on every click after the menu opens, so tapping outside never closes the menu. It also registers a **new** document listener on every toggle. Rewrite: register one document listener once, use `!event.target.closest('#mobileMenu, #burgerBtn')`.

### H9. `home.js` crashes on About and Privacy pages
Both pages include `js/home.js`, whose first statement does `toggle.addEventListener` on `document.querySelector(".service-toggle")` → `null` → TypeError, killing the rest of the file (including the burger-nav close handlers). Either guard each block (`if (toggle) {...}`) or stop including home.js on pages without services. (Related dead code: `querySelectorAll(".card-container")` matches nothing on any page.)

---

## 🟡 MEDIUM — quality, trust, and compliance polish

### M1. Privacy policy describes a site that doesn't exist
Twilio compliance reviewers and CCPA both care that the policy matches reality:
- Claims Google Analytics + cookies — GA is not installed on any page. Either install it or (simpler) say you don't use analytics cookies.
- Claims "JWT-based authentication for all admin access" — no admin exists.
- Claims domain `yasminbeauty.salon` (see C5).
- Mentions "Feedback or review content submitted through the Site" — no such feature.
Trim the policy to what's true; it's a stronger compliance position than an aspirational one.

### M2. i18n gaps and bugs
- `booking.hours.monday` key is missing from **both** locale files → "Monday" stays English in Spanish.
- "Beauty Salon" / "Barber Salon" toggle buttons and the "Baby Highlight" card title have no `data-i18n`.
- `es.json` has `common.btn.book`, `privacy.eyebrow`, `privacy.title` that `en.json` lacks; `en.json` has `services.blowdry.time` that `es.json` lacks — keep the files key-identical or missing keys fail silently.
- `form.hair-img` in en.json renders a red required asterisk on the *optional* image field after a language switch.
- `language.js:15` logs every translation value to console — remove.
- The Spanish option uses the El Salvador flag (`fi-sv`). If that's a deliberate nod to the community, keep it; if you meant Spanish-the-language generically, `fi-mx` or `fi-es` is what users expect.

### M3. Copy typos (they cost trust on a customer-facing site)
- `en.json`: "Thank **your** for booking", `"modal.close": "close"` (lowercase).
- `about.html`: Spanish has multiple typos — "dueña **des**", "**adelate**", "**arreppentiras**", "**tabajo**", plus a `<Strong>` tag. The es.json `about.p` fixes some but the hardcoded HTML is what renders first.
- About page hero is a `placehold.co` placeholder image — swap in a real photo of Claudia/the salon before launch; the About story is your best conversion asset.
- Backend `README.md`: "Hey I'm a REAME". Frontend `README.md` is saved as **UTF-16** and renders as garbled bytes on GitHub — re-save as UTF-8.
- Package name typo `yasminbackedn`, `FROM_NUMER` — cosmetic, rename whenever you next touch everything.

### M4. Accessibility
- `--font-size-p: 0.680rem` (≈10.9px) — paragraph text is far too small; 14px (0.875rem) minimum.
- Modals lack `role="dialog"`, `aria-modal="true"`, focus trapping, and Escape-to-close.
- Language button needs `aria-expanded`; the map `<iframe>` needs a `title`.
- Gallery alt texts are generic ("Style Example") — describe the work ("Blue balayage on long hair"); this is also free SEO.

### M5. Performance & SEO
- Gallery/hero JPGs are 330–440KB each (~2.7MB on the home page). Resize to display size, convert to WebP, add `loading="lazy"` and explicit `width`/`height` (prevents layout shift).
- No favicon, no `<meta name="description">`, no Open Graph tags — the link preview when the salon shares the site on Instagram/TikTok will be blank. 30 minutes of work, disproportionate payoff for a local business.
- Font Awesome's entire CSS is loaded for two icons — inline the two SVGs.
- `https://cdn.jsdelivr.net/npm/flatpickr` is unpinned — pin a version (`flatpickr@4.6.13`) so a CDN update can't break booking day-of.
- Add a `robots.txt` and let Google index it; register the site on Google Business Profile when live.

### M6. Backend hygiene
- No catch-all `@ExceptionHandler(Exception.class)` → unexpected errors return raw Spring bodies. Add one returning a generic message (don't leak internals).
- Enum/date parse failures (`HttpMessageNotReadableException`) aren't handled → ugly default 400s; handle for clean frontend messages.
- `JwtFilter.writeUnauthorized` builds JSON by string concat — a message containing `"` breaks the JSON. Use a serializer or keep messages constant.
- Dead code: commented-out endpoints in the controller, `/hello` and `/multiple` still in the SecurityConfig permit list, `@Builder`+validation annotations on the *response* DTO (meaningless), unused `ApplicationContext` in JwtFilter.
- `Twilio.init()` runs per message — call once in a `@PostConstruct`.

### M7. Design & color review (you asked for criticism — here it is)
The cream/brown/gold palette (`#F6F1E8` / `#2D241F` / `#B08A52`) is cohesive, warm, and right for the brand. Real critiques:
- **Hardcoded color sprawl:** `#3B2A1E`, `#51402f`, `#614d38`, `#6b4f2e`, `#6b5c4e`, `#251D19`, `#1a1310` all live outside your `:root` variables. Consolidate into the token set or future changes will drift.
- **Referenced-but-undefined variables:** `--color-text`, `--color-border`, `--color-muted` are used in `book-appointment.css` but never defined — those declarations silently fall back. Define them or remove them.
- **The dark halo shadow** on nav/CTA buttons (`0 0 11px 1px rgba(53,49,49,0.8)`) reads as a smudge on the dark header — soften to a subtle elevation shadow.
- **Border-radius inconsistency:** 40px inputs, 20px drop zone, 10px cards, 24px modal, 999px pills. Pick 2–3 radii and standardize.
- **Red `*` asterisks** clash with the muted palette — your gold `--color-primary` at bold weight does the same job in-brand. (Moot for the consent checkbox once B7 removes it.)
- The success modal's `.customer-name` span is never populated — either fill it from the response after C1 or delete it.
- `home.js` toggle listener is on the whole container, so clicking the *already-selected* side still flips it — check `data-target` before toggling.
- Uppercase `P` selector in global-layout.css works but will bite you in a refactor; lowercase it.

---

## 🟢 LOW — whenever
- Unused images in `/images` (`linkedin_2335321.png`, `youtube_2585154.png`, `icon-instagram.png`, `social-media_15713399.png`) and README mentions of Instagram/YouTube that aren't in the footer — reconcile.
- Rename `images/images.png` (the logo) to `logo.png`.
- `.vscode/settings.json` committed — harmless, but most people gitignore it.
- `devGenerateToken` service method + commented dev endpoint — delete before prod.
- `retrieveDisableDateTime` publicly exposes all booked time blocks — acceptable trade-off for availability UX, just be aware it's public.
- Footer says "SMS/Email" in the modal copy but email doesn't exist anywhere — your B-modal work replaces this copy anyway.

---

## Review of your proposed plan (uploaded ROADMAP.md)

**Overall: yes, this is the right direction, and the sequencing logic is sound. Ship Workstream B first, not A.** Twilio's re-review is an external queue you don't control — every day B isn't submitted is a day of dead time. A (available slots) is a UX improvement the site can launch without; the backend already rejects conflicts, so worst case a customer picks a taken slot and gets the failure modal.

Point-by-point notes:

**B-Backend (1–5):**
- **B1 is already half-done** — `smsConsent` exists on both the DTO and entity. The real change is one line: `@NotNull @AssertTrue Boolean smsConsent` → `@NotNull Boolean smsConsent` (keep `@NotNull` so the frontend must send an explicit true/false; a missing field defaulting to consent=true would be a compliance bug).
- **B3** — correct, and while you're in `sendBookingNotifications`, fix **C2** (send to `appointment.getPhoneNumber()`, not `TWILIO_TO_NUMber`) and **C6** (the static reminder instant). Don't gate-and-ship a scheduler that's broken anyway.
- **B4** — return the full URL, not just the raw JWT, so the modal button is a dumb link. Also note the booking response currently omits the appointment status; add it.
- **B5** — `/afterValidMagicLink` already is your "GET appointment by token" endpoint in all but name and verb. Generalizing it is right. Extend `AppointmentResponse` with `appointmentStatus` (the view page must render "already canceled" states), and implement **H4** so dead links get a JSON body.

**B-Modal (9–10):**
- Item 9's open question ("if false, or always — decide explicitly"): **always show the View Appointment button.** SMS delivery is not guaranteed even with consent (carrier filtering, wrong number, STOP'd numbers), and one code path is simpler than two. When consent is true, the modal copy can additionally mention the SMS.

**B-View page (11–16):**
- 11–15 are well thought through — the URL-token-first, strip-with-`replaceState`, localStorage-fallback, zero-calls-without-token sequence is the correct security posture. Two additions:
  - On **401/expired**, also remove the token from localStorage (you say "clear state" — make sure that includes storage, or the page permanently errors for that visitor).
  - **16 (lifecycle):** clear on CANCEL completion (nothing left to view); keep after CONFIRM until natural JWT expiry (the token already expires at appointment end — `JwtService.generateToken` uses appointment end time — so "indefinitely accessible" can't actually happen; your existing design already solved this).
- The view page must also handle the reschedule flow eventually — after a reschedule the old token is dead (status → RESCHEDULED) and a new token is SMS'd. If the user rescheduled *without* consent, the response from `/reschedule` must return the new token/URL and the page must swap it into localStorage, or non-consent users lose access to the new appointment. **This case is missing from your plan — add it as item 15b.**

**A (available slots):**
- Endpoint + gap algorithm design is sound. `ServiceType.getDurationMinutes()` already includes the 10-min buffer — don't add the buffer a second time in the gap check.
- Include status BOOKED **and** CONFIRMED when querying booked appointments (your plan says only CONFIRMED — most appointments will sit in BOOKED forever if the customer never clicks the link; filtering only CONFIRMED would double-book every BOOKED slot).
- **Missing edge case: same-day bookings.** For `date == today`, filter out slots earlier than now (+ a lead time, e.g. 1–2h so the owner isn't ambushed).
- Sunday needs the 15:00 close as the virtual end boundary; Monday returns empty.
- Prefer `GET /available-slots?service=&date=` over POST — it's a read.
- 5-minute granularity gives ~120 options per day; consider 15-min steps for a friendlier picker. Also decide the empty-day response: return `{"availableSlots": []}` with 200 rather than an error — "no availability" is data, not failure.
- The A-Frontend list is complete; note it quietly includes the *entire* C1 fix (booking POST wiring) as its last three bullets — that's the most important part of the whole workstream, don't leave it for last within A.

**Revised execution order for a Friday deploy:**
1. **B-Backend (1–5)** + C2 + C6 + C7 + H2 (fix tests first — they guard the refactor) → deploy backend → **resubmit to Twilio immediately** (the review clock matters more than anything else)
2. **C1** (wire booking form, JSON payload, API base URL) + **B-Form (6–8)** + C8 decision (make image optional)
3. **C5** (one domain everywhere) + H7 config → deploy both → end-to-end test with a real booking
4. **B-Modal (9–10) + B-View page (11–16)** + H4
5. **i18n (17)** + M2 keys + M3 typos + M1 policy alignment
6. **A** (available slots) — next week; the site launches fine without it
7. **H1** (owner view) — right behind A; the salon can't run blind for long

---

## Deploy-by-Friday checklist

**Reality check on SMS:** even with the consent fix, US A2P 10DLC campaign approval (or toll-free verification) takes days. Plan to **launch with SMS gated off** (which your consent refactor enables cleanly — the site works fully without it) and let Twilio approval land when it lands. The "View Appointment" button + view page is the consent-free path, which is exactly why B must be finished before launch.

**Backend (Render/Railway/Fly + existing Neon DB):**
- [ ] Confirm host supports Java 25 (or downgrade to 21 now — H7)
- [ ] Set env vars: `DB_URL/USERNAME/PASSWORD`, `JWT_SECRET` (long random base64, newly generated for prod), Twilio vars, `SECURITY_*`
- [ ] `show-sql=false`; permit `/actuator/health`; verify CORS = final frontend origin only
- [ ] Verify SMS link base URL = final frontend domain (make it an env var)
- [ ] `mvn test` green (H2)

**Frontend (Vercel):**
- [ ] `API_BASE` points at the deployed backend
- [ ] `STRAIGHTENING` → `KERATIN_TREATMENT` (C7)
- [ ] Consent checkbox optional + compliance copy (C3)
- [ ] Real booking round-trip tested on the production URL, both languages, mobile viewport
- [ ] Favicon + meta description + OG tags (M5 — cheap, do it)
- [ ] Fix burger.js (H8) and home.js guards (H9) — both are visible-to-customers bugs on mobile

**Twilio resubmission:**
- [ ] Checkbox optional, unchecked by default, with STOP/HELP/rates disclosure adjacent
- [ ] Privacy policy §04 reachable from the form (already linked) and consistent with the form (C3)
- [ ] Policy trimmed to reality (M1)
- [ ] Screenshot the live form for the campaign submission — Twilio wants to see the real page on the real domain
