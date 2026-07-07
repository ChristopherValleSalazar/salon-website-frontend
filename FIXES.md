# Yasmin Beauty Salon — Fix Guide

Companion to `ROADMAP.md`. Same IDs, same order. Each entry: what to change, where, and the code. Snippets are written against the current code on `main` of both repos — adjust names if you've already started the consent refactor.

---

## 🔴 CRITICAL

### C1. Wire the booking form to the backend

**Step 1 — add an API base config.** Create `js/config.js` and load it before the other scripts on `book-appointment.html`:

```js
// js/config.js
const API_BASE =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:8080"
    : "https://YOUR-BACKEND.onrender.com"; // <- your deployed backend
```

```html
<script src="js/config.js" defer></script>
<script src="js/book-appointment.js" defer></script>
```

**Step 2 — replace the submit handler** in `js/book-appointment.js`. Build the JSON payload explicitly (the DTO field names, not the form `name=` attributes), and split the flatpickr value:

```js
document.getElementById("appointment-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const dateInput = document.getElementById("date-input");
  const visibleInput = dateInput._flatpickr.altInput;
  if (!dateInput.value) {
    visibleInput.classList.add("input-error");
    visibleInput.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  visibleInput.classList.remove("input-error");

  // "2026-07-15 10:00" -> date + startTime
  const [date, startTime] = dateInput.value.split(" ");

  const payload = {
    name: document.getElementById("customerName").value.trim(),
    phoneNumber: document.getElementById("client-phone").value.trim(),
    serviceType: document.getElementById("service").value,
    date,
    startTime,
    smsConsent: document.getElementById("consentSMS").checked, // real boolean
    additionalNotes: document.getElementById("notes").value.trim() || null,
    hairImageUrl: null, // see C8
  };

  const submitBtn = document.querySelector(".book-app-btn");
  submitBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/v1/appointments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const body = await res.json();
      modalBehaviour(body); // pass response so the modal can show name / view-link (B9)
    } else {
      const body = await res.json().catch(() => ({}));
      failureModalBehaviour(body.error || body.message);
    }
  } catch (err) {
    failureModalBehaviour(); // network error -> translated placeholder text
  } finally {
    submitBtn.disabled = false;
  }
});
```

The backend's error shape is `{"type": "...", "error": "..."}` (see `GlobalExceptionHandler`), so `body.error` is the right key.

**Step 3 — test locally**: run the backend, serve the frontend on `http://localhost:5501`, add that origin to CORS (C5), and make one real booking end-to-end before touching anything else. Everything below builds on this working.

---

### C2. Send SMS to the customer, not `TWILIO_TO_NUMBER`

Thread the phone number through every SMS call.

**`SmsService.java`** — add a `String toPhone` parameter to all three methods and pass it along:

```java
public void scheduleSmsMagicLink(String toPhone, String token, LocalDate date,
                                 LocalTime startTime, LocalTime endTime) {
    taskScheduler.schedule(() ->
        twilioService.twilioAppointmentNotification(toPhone, token, date, startTime, endTime),
        Instant.now());
}
```

**`TwilioService.java`** — accept the number and use it as the `to`:

```java
public void twilioAppointmentNotification(String toPhone, String token, LocalDate date,
                                          LocalTime startTime, LocalTime endTime) {
    ...
    scheduleSms(toPhone, smsText);
}

private void scheduleSms(String toPhone, String smsMessageText) {
    Message.creator(new PhoneNumber(toPhone), FROM_NUMBER, smsMessageText).create();
}
```

The phone is already stored E.164-formatted on the entity (`isPhoneValid` returns E164), so `appointment.getPhoneNumber()` is directly usable:

```java
// AppointmentService.sendBookingNotifications
smsService.scheduleSmsMagicLink(appointment.getPhoneNumber(), token, ...);
```

Delete the `TO_NUMBER` field, the `twilio.to.number` property, and the env var (or keep them only in a dev profile). While here, do M6's `Twilio.init` fix:

```java
@PostConstruct
void init() { Twilio.init(ACCOUNT_SID, AUTH_TOKEN); }
```

and remove `Twilio.init` + `System.out.println` from `scheduleSms`.

---

### C3. Make SMS consent optional

**Backend — `AppointmentRequest.java`**, one line:

```java
// before
@NotNull @AssertTrue Boolean smsConsent,
// after
@NotNull Boolean smsConsent,
```

Keep `@NotNull`: the frontend must send an explicit `true`/`false`; a missing field must never default to consent.

**Backend — gate every SMS** in `sendBookingNotifications`:

```java
if (Boolean.TRUE.equals(appointment.getSmsConsent())) {
    try {
        smsService.scheduleSmsMagicLink(appointment.getPhoneNumber(), token, ...);
        smsService.scheduleAppointmentReminder(appointment.getPhoneNumber(), token, ...);
    } catch (Exception e) {
        log.error("Failed to schedule SMS for appointment {}", appointment.getId(), e);
    }
} else {
    log.info("SMS consent not given for appointment {}, skipping notifications", appointment.getId());
}
```

Also gate `scheduleSmsCancellationOrConfirmation` in `cancelOrConfirmAppointment` and the magic-link SMS in `rescheduleAppointment` the same way (`appointment.getSmsConsent()` is carried over on reschedule already).

**Frontend — `book-appointment.html`:** remove `required` from the checkbox and replace the label with compliant copy:

```html
<div class="consent-wrapper">
  <input type="checkbox" id="consentSMS" name="consentSMS">
  <label for="consentSMS" data-i18n="form.consentSMS">
    (Optional) Text me appointment confirmations and reminders.
    Message frequency varies. Msg &amp; data rates may apply.
    Reply STOP to opt out, HELP for help. See our
    <a href="privacy-policy.html">Privacy Policy</a>.
  </label>
</div>
```

Update `form.consentSMS` in both locale files to match (no `<span class="required">`). There is no JS validation branch blocking submission on the checkbox (your roadmap item B8) — the `required` attribute was the only enforcement, so removing it is the whole frontend fix.

---

### C4. Build `view-appointment.html`

New page + `js/view-appointment.js`. Reuse the site header/footer markup from `book-appointment.html`. Core JS implementing your roadmap items 11–16 (with the H4-aware error handling):

```js
// js/view-appointment.js
const TOKEN_KEY = "ybs_appt_token";

document.addEventListener("DOMContentLoaded", async () => {
  // 11-12: URL param first, then strip it from history
  const params = new URLSearchParams(location.search);
  let token = params.get("token");
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    history.replaceState(null, "", location.pathname);
  } else {
    // 13: fallback
    token = localStorage.getItem(TOKEN_KEY);
  }

  // 14: no token -> empty state only, zero backend calls
  if (!token) return showState("empty");

  // 15: fetch appointment details
  try {
    const res = await fetch(`${API_BASE}/api/v1/appointments/afterValidMagicLink`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      renderAppointment(await res.json());
    } else {
      localStorage.removeItem(TOKEN_KEY); // dead token: purge or the page errors forever
      showState(res.status === 401 ? "expired" : "error");
    }
  } catch {
    showState("network-error"); // keep the token: server may just be down
  }
});

async function act(status) { // status: "CONFIRM" | "CANCEL"
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(
    `${API_BASE}/api/v1/appointments/cancelOrConfirm?status=${status}`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.ok && status === "CANCEL") {
    localStorage.removeItem(TOKEN_KEY); // 16: nothing left to view
    showState("canceled");
  }
  // on CONFIRM keep the token; the JWT already expires at appointment end
}
```

Markup needs four states (hidden `<section>`s toggled by `showState`): appointment details + Confirm/Cancel/Reschedule buttons, "no appointment found" empty state, "link expired" state, generic error. Add the EN/ES strings for all four (your i18n item 17).

Prerequisite from B5: add `appointmentStatus` (and ideally the raw `date`/`startTime` plus a display-friendly version) to `AppointmentResponse` so the page can render "already confirmed" correctly:

```java
public record AppointmentResponse(
        String name, ServiceType serviceType, LocalDate date,
        LocalTime startTime, LocalTime endTime,
        AppointmentStatus appointmentStatus) {}
```

**Reschedule-without-consent (the 15b gap):** `POST /reschedule` must return the new token, or non-consent users lose the new appointment. Add `String viewToken` to `RescheduleAppointmentResponse`, set it from the token already generated inside `rescheduleAppointment`, and in the page JS:

```js
const body = await res.json();
if (body.viewToken) localStorage.setItem(TOKEN_KEY, body.viewToken);
```

---

### C5. One domain everywhere

1. Decide the production frontend URL (assume `https://yasmin-salon-seven.vercel.app` since that's the live Vercel project; swap if you buy `yasminbeauty.salon`).
2. **Backend** — make both configurable in `application.properties`:

```properties
app.frontend.base-url=${FRONTEND_BASE_URL}
app.cors.allowed-origins=${CORS_ALLOWED_ORIGINS}
```

```java
// SecurityConfig
public CorsConfigurationSource corsConfigurationSource(
        @Value("${app.cors.allowed-origins}") List<String> origins) {
    CorsConfiguration config = new CorsConfiguration();
    config.setAllowedOrigins(origins);
    config.setAllowedMethods(List.of("GET", "POST", "OPTIONS"));
    config.setAllowedHeaders(List.of("Content-Type", "Authorization"));
    config.setAllowCredentials(false); // H7: no cookies in this API
    ...
}
```

```java
// TwilioService — inject instead of hardcoding
@Value("${app.frontend.base-url}") String frontendBaseUrl;
String link = frontendBaseUrl + "/view-appointment.html?token=" + token;
```

3. Env values — prod: `FRONTEND_BASE_URL=https://yasmin-salon-seven.vercel.app`, `CORS_ALLOWED_ORIGINS=https://yasmin-salon-seven.vercel.app`; local `.env`: add `,http://localhost:5501,http://127.0.0.1:5501` to origins. Delete `http://chris-fedora:5501`.
4. Privacy policy: change `yasminbeauty.salon` to the real domain (both HTML and both locale JSONs, key `privacy.s01.p1`).

---

### C6. Fix reminders: DB-backed sweep

Delete the static field and the `taskScheduler`-based reminder entirely. Recommended approach (survives restarts, free):

**1. Entity** — add a column:

```java
private LocalDateTime reminderSentAt;
```

**2. Repo** — query for tomorrow's unreminded, consented appointments:

```java
@Query("""
    SELECT a FROM Appointment a
    WHERE a.date = :date
      AND a.reminderSentAt IS NULL
      AND a.smsConsent = true
      AND a.appointmentStatus IN (salon.yasminbeauty.yasminbackedn.entity.AppointmentStatus.BOOKED,
                                  salon.yasminbeauty.yasminbackedn.entity.AppointmentStatus.CONFIRMED)
    """)
List<Appointment> findNeedingReminder(LocalDate date);
```

**3. New `ReminderJob`:**

```java
@Component
public class ReminderJob {
    // every 30 min; each appointment gets its reminder in the ~24h window before the visit
    @Scheduled(cron = "0 */30 * * * *")
    @Transactional
    public void sendReminders() {
        for (Appointment a : repo.findNeedingReminder(LocalDate.now().plusDays(1))) {
            String token = jwtService.generateToken(a.getId(), a.getDate(), a.getEndTime());
            try {
                twilioService.appointmentReminder(a.getPhoneNumber(), token,
                        a.getDate(), a.getStartTime(), a.getEndTime());
                a.setReminderSentAt(LocalDateTime.now());
            } catch (Exception e) {
                log.error("Reminder failed for appointment {}", a.getId(), e);
            }
        }
    }
}
```

`@EnableScheduling` is already on `ScheduleConfig`. Remove `scheduleAppointmentReminder` from the booking path; the confirmation magic-link SMS can also just be sent inline (it fires "now" anyway) — at that point `SmsService`'s scheduler wrapper can be deleted and the booking path calls `TwilioService` directly.

Alternative if you'd rather not add a column: Twilio native scheduling — `Message.creator(...).setSendAt(zonedDateTime).setScheduleType(Message.ScheduleType.FIXED)` — but it requires a Messaging Service SID and max 35 days ahead; the cron sweep is simpler and debuggable.

**Timezone note:** the server compares `LocalDateTime.now()` against appointment times in several places. Pin the app to the salon's timezone or a UTC-offset bug will let people book "past" slots: run with `-Duser.timezone=America/Los_Angeles` or set `spring.jackson.time-zone` + `TimeZone.setDefault` in `main()`.

---

### C7. `STRAIGHTENING` → `KERATIN_TREATMENT`

Two files, three spots:
- `book-appointment.html:116` — `<option value="KERATIN_TREATMENT" data-i18n="form.services.straightening">`
- `index.html:284` — `data-service="KERATIN_TREATMENT"` on the keratin card's book button
- Optional cleanup: rename the i18n keys `form.services.straightening` / `services.straightening.*` to `...keratin...` in both HTML and both locale files (pure rename, do it in one grep pass or skip it).

Also fix the en.json label: `"form.services.straightening": "Straightening"` → `"Keratin Treatment"` (the dropdown currently shows a different name than the services page for the same service).

---

### C8. Unblock the six image-required services

**For Friday (option A):** delete the requirement in `AppointmentService.bookAppointment`:

```java
// delete this block
if (REQUIRES_IMAGE.contains(request.serviceType()) && ...) {
    throw new MissingHairImageException(...);
}
```

Keep the `REQUIRES_IMAGE` set for later. On the form, change the Hair Image label to "(Optional — helps us prepare for color services)" and remove the asterisk from `form.hair-img` in en.json. Nudge users via the notes placeholder: "For color services, describe your current color / last dye date."

**Later (option B, real uploads):** Cloudinary free tier — create an unsigned upload preset, then before the booking POST:

```js
async function uploadHairImage(file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", "YOUR_UNSIGNED_PRESET");
  const res = await fetch("https://api.cloudinary.com/v1_1/YOUR_CLOUD/image/upload",
                          { method: "POST", body: fd });
  if (!res.ok) throw new Error("upload failed");
  return (await res.json()).secure_url;
}
// in submit handler:
const file = document.getElementById("hair-image").files[0];
if (file) payload.hairImageUrl = await uploadHairImage(file);
```

Then re-enable the server-side check. Validate the URL server-side (`InvalidImageUrlException` already exists): require prefix `https://res.cloudinary.com/YOUR_CLOUD/`.

---

## 🟠 HIGH

### H1. Minimal owner view

**Backend** — one endpoint + Basic Auth for the owner only:

```java
// AppointmentController
@GetMapping("/admin/daily")
public ResponseEntity<List<Appointment>> dailyAppointments(
        @RequestParam(required = false) LocalDate date) {
    return ResponseEntity.ok(service.findForDay(date != null ? date : LocalDate.now()));
}
```

```java
// SecurityConfig — activate the already-configured spring.security.user
http.authorizeHttpRequests(request -> request
        .requestMatchers("/actuator/health").permitAll()
        .requestMatchers(HttpMethod.GET, "/api/v1/appointments/disableDateTime").permitAll()
        .requestMatchers(HttpMethod.POST, "/api/v1/appointments").permitAll()
        .requestMatchers("/api/v1/appointments/admin/**").hasRole("ADMIN") // NEW
        .anyRequest().authenticated())
    .httpBasic(Customizer.withDefaults()); // NEW
```

Add `spring.security.user.roles=ADMIN` to properties. The browser will prompt for the `SECURITY_USERNAME`/`SECURITY_PASSWORD` credentials — zero frontend work needed for v1; `appointments-owner.html` can later render this endpoint into a table. Remove the now-dead permit entries for `/hello` and `/multiple` while editing.

Heads-up: `JwtFilter` runs on admin requests too; it ignores requests without a `Bearer` header, so Basic Auth passes through untouched — no change needed there.

### H2. Fix the tests

In `AppointmentServiceTest.java`:
1. Replace all three `when(repo.findByDate(...))` with `when(repo.findByDateForUpdate(...))`.
2. `bookAppointment_rejectsMonday` → expect `SlotIsMondayException`.
3. `bookAppointment_rejectsPastDateTime` → expect `PastDateException`.
4. `rejectsBeforeOpeningTime` / `rejectsAfterRegularClosingTime` / `rejectsSundayAfterEarlyClose` → expect `OutsideServiceHoursException`.
5. `rejectsWhenEndTimeRunsPastRegularClosing` / `...SundayClosing` → expect `EndsAfterClosingException`.
6. Overlap tests correctly keep `SlotUnavailableException` — but the mocked existing appointments must have a status the check counts: add `.appointmentStatus(AppointmentStatus.BOOKED)` to the builders (the `@Builder.Default` does apply, so this may already pass — add it explicitly anyway so the test states its assumption).

Then add tests for the new behavior: booking with `smsConsent=false` succeeds and schedules no SMS (verify `smsService` mock has zero interactions — add `@Mock SmsService smsService` and `@Mock JwtService jwtService` so `@InjectMocks` stops injecting nulls).

### H3. Harden reschedule

In `rescheduleAppointment`, before mutating anything:

```java
Appointment appointment = (Appointment) authentication.getPrincipal();
validateAppointmentBeforeSms(appointment); // same 2h cutoff + status check as cancel

LocalTime endTime = request.startTime().plusMinutes(...);
validateDateTime(request.date(), request.startTime(), endTime); // validate BEFORE cancelling the old one
appointment.setAppointmentStatus(AppointmentStatus.RESCHEDULED);
...
```

Note the subtlety: validating the new slot *before* freeing the old one means you can't reschedule into a slot that only overlaps your own old appointment (e.g. move 10:00→10:30). If you want that, set the old one to RESCHEDULED first (current behavior) and rely on `@Transactional` rollback — but then the SMS **must** move after commit. Cleanest: return the response from the service without sending SMS, and send from the controller after the transactional method returns (exactly the `bookAppointment` / `sendBookingNotifications` split you already have — mirror it: `rescheduleAppointment()` + `sendRescheduleNotifications()`).

Also delete the `if (appointment != null)` wrappers in both `rescheduleAppointment` and `cancelOrConfirmAppointment` — the principal can't be null past the filter, and the null-return path produces an empty 200 which the frontend would misread as success.

### H4. JSON error for inactive-status links

In `JwtFilter.doFilterInternal`, replace the silent skip:

```java
if (appointment.getAppointmentStatus() == AppointmentStatus.BOOKED
        || appointment.getAppointmentStatus() == AppointmentStatus.CONFIRMED) {
    ... set authentication ...
} else {
    writeUnauthorized(response, "AppointmentInactive",
            "This appointment is " + appointment.getAppointmentStatus().name().toLowerCase() + ".");
    return;
}
```

The view page (C4) then shows a proper "this appointment was canceled/rescheduled" state instead of a generic error.

### H5. Align business hours

Decide with the owner: is opening 9:00 or 10:00? Then:
- Backend: `OPENING_TIME` in `AppointmentService.java:110`.
- Frontend copy: hours table in `book-appointment.html`.
- Flatpickr: `minTime`. For Sunday set `maxTime` to `15:00 - shortest service` (e.g. `"14:30"`) so the picker can't offer a start the backend always rejects — or better, stop fighting it: once Workstream A ships, replace flatpickr's `enableTime` with a date-only picker + a slot grid rendered from `/available-slots`, and the backend becomes the only source of truth.

### H6. Stop logging tokens & PII

- `SmsService.java:32`: `logger.info("Sending magic link SMS with token: " + token)` → `log.info("Sending magic link SMS for appointment {}", appointmentId)` (pass the id in, or move the log into `TwilioService`).
- `AppointmentService.java:102,105`: `"Invalid phone number: " + phoneNumberString` → `"Invalid phone number format"` (the user knows what they typed; don't echo it into logs/responses).
- Delete `System.out.println(message.getBody())` (`TwilioService.java:65`).
- `application.properties`: `spring.jpa.show-sql=false` (or move `=true` to a local-only profile: create `application-local.properties` and run with `--spring.profiles.active=local` in dev).

### H7. Production config

- **Java version:** check your host. Render's native Java runtime and most buildpacks top out at 21/22 today. If Java 25 isn't offered, either deploy via Docker (`eclipse-temurin:25-jre` base image) or set `<java.version>21</java.version>` — scan the code for 22+ features first (I saw none; it compiles fine on 21 semantics).
- `spring.jpa.hibernate.ddl-auto=update` is fine for launch; schedule the Flyway migration for the week after (baseline the current schema with `flyway:baseline`, then `ddl-auto=validate`).
- CORS `allowCredentials(false)` + explicit headers — included in the C5 snippet.
- `/actuator/health` permitAll — included in the H1 snippet.
- Generate a fresh prod `JWT_SECRET`: `openssl rand -base64 64`.

### H8. Rewrite `burger.js`

Replace the whole file:

```js
function burgerBehaviour() {
    document.getElementById("burgerBtn").classList.toggle("expanded");
    document.getElementById("mobileMenu").classList.toggle("open");
}

// one listener, registered once; closest() takes a selector string
document.addEventListener("click", (event) => {
    if (!event.target.closest("#mobileMenu, #burgerBtn")) {
        document.getElementById("mobileMenu").classList.remove("open");
        document.getElementById("burgerBtn").classList.remove("expanded");
    }
});
```

### H9. Guard `home.js`

Wrap each block so pages without those elements don't crash:

```js
const toggle = document.querySelector(".service-toggle");
if (toggle) {
    toggle.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-target]");
        if (!btn || !btn.classList.contains("unfocus-color")) return; // M7: ignore clicks on the already-active side
        ...existing toggle logic...
    });
}
```

Delete the dead `.card-container` block (matches nothing). The `.book-btn` and `.nav-btn-burger` loops are already null-safe (`querySelectorAll` + `forEach`). Simplest alternative: remove `<script src="js/home.js">` from `about.html` and `privacy-policy.html` — nothing on those pages uses it, and the burger-close behavior belongs in `burger.js` anyway (move the `.nav-btn-burger` close-on-tap loop there).

---

## 🟡 MEDIUM

### M1. True-up the privacy policy
In `privacy-policy.html` + both locale files:
- §06 Analytics: either add GA4 for real, or rewrite to "We do not currently use analytics or advertising cookies. The Site stores only a language preference in your browser's local storage." Delete the GA opt-out link. (The language preference + token in localStorage are worth mentioning regardless.)
- §09: replace "JWT-based authentication for all admin access" with "Time-limited, signed appointment links (JWT) that expire when your appointment ends" — true and better.
- §01: real domain (C5).
- §02: delete the "Feedback or review content" bullet until the feature exists.

### M2. i18n fixes
- Add to **both** files: `"booking.hours.monday": "Monday"` / `"Lunes"`.
- Add `data-i18n` + keys for the Beauty/Barber toggle buttons (`services.toggle.beauty`, `services.toggle.barber`) and the Baby Highlight `<h3>` (`services.baby-highlight.title`).
- Reconcile stray keys: delete `services.blowdry.time` from en.json (unused); add EN values for `common.btn.book`, `privacy.eyebrow`, `privacy.title` or delete them from es.json. Quick guard: run the key-diff snippet from the audit as a pre-commit habit.
- Delete `console.log(val)` and `console.log('switching to', lang)` from `language.js`.
- Flag: keep `fi-sv` if the Salvadoran flag is intentional for your clientele; otherwise `fi-mx`.

### M3. Copy fixes
- en.json: `"modal.heading": "Thank you for booking an appointment"`, `"modal.close": "Close"`.
- `about.html`: corrected Spanish — *"Soy la dueña **de** Yasmin Beauty Salon... con ganas **de** salir **adelante** y triunfar... conozcas nuestro **trabajo**, te aseguro que no te **arrepentirás**."* Fix `<Strong>` → `<strong>`. Better: put the Spanish in `es.json`'s `about.p` (already mostly there) and leave English in the HTML, since the page declares `lang="en"`.
- Replace the placehold.co image with a real photo in `images/`.
- Backend README: write a real one (stack, env vars list, how to run, endpoints).
- Frontend README: re-save as UTF-8 — `iconv -f UTF-16 -t UTF-8 README.md -o README.md` — and update the stale bits (Lorem Picsum, email, socials).

### M4. Accessibility
- `global-layout.css`: `--font-size-p: 0.875rem;` (then sanity-check the footer/cards, which mostly set their own sizes).
- Modals: add `role="dialog" aria-modal="true" aria-labelledby="modal-title-id"` to each `.modal-container`; close on Escape:
  ```js
  document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") document.querySelectorAll(".modal-overlay.is-open")
          .forEach(m => m.classList.remove("is-open"));
  });
  ```
- `<button class="language-btn" aria-expanded="false" aria-haspopup="listbox">` and toggle `aria-expanded` in `language.js`.
- Map iframe: `title="Map showing Yasmin Beauty Salon location"`.
- Descriptive gallery `alt`s ("Blue balayage on long dark hair", etc.).

### M5. Performance & SEO
- Images: `npx @squoosh/cli --webp auto --resize '{"width":1200}' images/*.jpg` (or any tool); update `src`s to `.webp`, add `width`/`height` + `loading="lazy"` to gallery images (not the hero).
- Every page `<head>`:
  ```html
  <link rel="icon" href="images/images.png">
  <meta name="description" content="Yasmin Beauty Salon Unisex in Los Angeles — haircuts, color, keratin treatments, and barber services. Book your appointment online.">
  <meta property="og:title" content="Yasmin Beauty Salon | Los Angeles">
  <meta property="og:description" content="Cuts, color, styling & barber services. Book online.">
  <meta property="og:image" content="https://YOUR-DOMAIN/images/blonde-curls.jpg">
  ```
- Replace Font Awesome with the two inline SVGs (clock, calendar-plus) and drop the CDN `<link>`.
- Pin flatpickr: `https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/flatpickr.min.js` (+ same for the theme CSS).
- `robots.txt`: `User-agent: *\nAllow: /` and (optionally) disallow `view-appointment.html`.

### M6. Backend hygiene
Add to `GlobalExceptionHandler`:

```java
@ExceptionHandler(HttpMessageNotReadableException.class)
public ResponseEntity<?> handleUnreadable(HttpMessageNotReadableException ex) {
    return ResponseEntity.badRequest()
            .body(Map.of("type", "InvalidRequest", "error", "Invalid request format"));
}

@ExceptionHandler(Exception.class)
public ResponseEntity<?> handleUnexpected(Exception ex) {
    log.error("Unhandled exception", ex);
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(Map.of("type", "ServerError", "error", "Something went wrong. Please try again."));
}
```

`JwtFilter.writeUnauthorized`: serialize with Jackson instead of string concat:
```java
response.getWriter().write(new ObjectMapper().writeValueAsString(Map.of("type", type, "message", message)));
```
(Inject a shared `ObjectMapper` rather than constructing one per response.)

Delete: commented-out controller endpoints, `devGenerateToken`, unused `ApplicationContext` in JwtFilter, `@Builder`-record validation annotations on `AppointmentResponse` (`@NotBlank`/`@NotNull` on a response are never evaluated).

### M7. CSS consolidation
Extend `:root` and sweep the hardcoded browns:

```css
:root {
  --color-light: #F6F1E8;
  --color-form: #f1e9da;
  --color-dark: #2D241F;
  --color-primary: #B08A52;
  --color-header: #251D19;
  --color-espresso: #3B2A1E;    /* pills, cta text */
  --color-submit-btn: #614d38;
  --color-submit-btn-hover: #4B3B2B;
  --color-text: #4a3c32;        /* was referenced but undefined */
  --color-muted: #8a7f72;       /* was referenced but undefined */
  --color-border: #ccc;         /* was referenced but undefined */
  --radius-pill: 999px;
  --radius-card: 12px;
  --radius-input: 40px;
}
```

Then grep each hex (`#3B2A1E`, `#51402f`, `#6b4f2e`, `#6b5c4e`, `#251D19`) and replace with the nearest token. Soften the nav-button halo: `box-shadow: 0 2px 8px rgba(0,0,0,0.25);`. Change `.main-form .required { color: red }` → `color: var(--color-primary); font-weight: 700;`. Lowercase the `P` selector.

---

## 🟢 LOW
- `git rm` unused images (`linkedin_2335321.png`, `youtube_2585154.png`, `icon-instagram.png`, `social-media_15713399.png`); rename `images.png` → `logo.png` (update 5 HTML refs + favicon).
- `echo '.vscode/' >> .gitignore` (frontend).
- Delete `appointments-owner.html` until H1's page exists, or make it the admin table page.
- Package rename `yasminbackedn` → `yasminbackend` (IDE refactor; touches every file — do it in a quiet moment, not launch week).

---

## Suggested commit order

Matches the revised execution order in `ROADMAP.md`:

| # | Commits | Repo | Unblocks |
|---|---------|------|----------|
| 1 | H2 (tests compile) → C3 backend + C2 + C6 + H6 | backend | Twilio resubmission |
| 2 | C5 config + H7 + H1 | backend | deploy |
| 3 | C1 + C7 + C8-A + C3 frontend | frontend | real bookings |
| 4 | C4 view page + H4 + B-modal button | both | consent-free appointment access |
| 5 | H8 + H9 + M2 + M3 | frontend | polish |
| 6 | M1 policy + M5 SEO | frontend | Twilio screenshot & sharing |
| 7 | Workstream A (slots) + H5 | both | next week |

Deploy after row 3 and test a real booking on the production URL before building row 4 against it.
