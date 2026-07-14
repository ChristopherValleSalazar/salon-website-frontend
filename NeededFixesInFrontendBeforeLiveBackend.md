# Frontend Fixes Needed Before the Backend Goes Live

> Internal checklist — safe to delete from the repo when done.
> Line numbers reference commit `ebecedf`; they'll drift as you edit.
> Phase 1 is mandatory the day the backend deploys. Phase 2 should ride the same deploy (it's all error-handling for real traffic). Phase 3 is post-launch quality.

---

## PHASE 1 — Booking flow is broken without these

### 1.1 Point the API at the real backend — `js/config.js:1`

Currently `http://localhost:8080`. On the HTTPS domain every call fails twice over: wrong host AND the browser blocks plain-`http` requests as mixed content. Replace with a hostname switch so local dev keeps working:

```js
const API_BASE_URL = ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'http://localhost:8080'
    : 'https://YOUR-REAL-BACKEND-URL';   // e.g. https://xxx.onrender.com — set when you deploy
```

### 1.2 Fix the hair-image scoping bug — `js/book-appointment.js:130-136`

`imageUploader()` assigns `imageUrl`/`imagePublicId`, but the `let` declarations live inside the `try` **block**, which the function can't see — the assignments create accidental globals and the payload always sends `hairImageUrl: null`. **The photo uploads to Cloudinary and is then thrown away.** Every image-required service (dyes, highlights, keratin, perm…) loses its photo.

Fix: declare the variables in the handler scope, above the function. After the date/time validation (around line 108) add:

```js
let imageUrl = null;
let imagePublicId = null;
```

…and DELETE these two lines inside the `try` block (currently 135–136):

```js
        let imageUrl = null;        // DELETE
        let imagePublicId = null;   // DELETE
```

### 1.3 Backend: CORS for the new origin (Spring Boot side, not this repo)

Allow `https://yasminbeauty.salon` **and** `https://www.yasminbeauty.salon` in the CORS config before cutover. Then run one real end-to-end booking (with a photo, and verify the photo URL lands in the DB) from the live domain.

---

## PHASE 2 — Ship with the same deploy (real-traffic error handling)

### 2.1 Close the double-submit window — `js/book-appointment.js:152`

The submit button is disabled only *after* the image upload awaits (line 138). During a slow phone upload a second tap re-runs everything → duplicate booking. Move `submitBtn.disabled = true;` to the top of the handler, right after the date/time validation (~line 108). It's already re-enabled in `finally`.

### 2.2 Show a "Sending…" state — `js/book-appointment.js`

Cold-starting free-tier backends take 30–60 s; the user gets zero feedback. Where you disable the button, also swap its label (and restore in `finally`):

```js
submitBtn.textContent = t('form.btn.sending', 'Sending…');
// finally: submitBtn.textContent = t('common.btn.appointment', 'Book Appointment');
```

Requires the tiny `t()` helper from 2.4 and two new locale keys:
`en.json`: `"form.btn.sending": "Sending…"` · `es.json`: `"form.btn.sending": "Enviando…"`

### 2.3 Add timeouts to every fetch — both JS files

No fetch has a timeout, so a hung backend = stuck UI. Add a signal to all of them (7 calls: `book-appointment.js:115,156,308` and `view-appointment.js:30,107,178,229`):

```js
fetch(url, { signal: AbortSignal.timeout(15000), /* ...existing options */ })
```

The existing `catch` blocks already route timeouts to the error paths.

### 2.4 Stop showing raw / English-only errors

- `js/book-appointment.js:167` — the hardcoded fallback `"An error occurred while submitting the appointment."` REPLACES the correctly translated modal placeholder. Pass `""` instead; `failureModalBehaviour` already falls back to the translated text. (Keep showing `body.error` when the backend provides one.)
- `js/book-appointment.js:170`, `js/view-appointment.js:137,269` — network failures show the browser's raw `err.message` ("Failed to fetch"). Pass `""` instead.
- `js/book-appointment.js:115` — signature fetch never checks `res.ok`; a 500 surfaces as `"Unexpected token '<'…"`. Add: `const sigRes = await fetch(...); if (!sigRes.ok) throw new Error(''); const sig = await sigRes.json();`
- This also covers **429 rate-limits**: any non-2xx without a usable `body.error` should land on the translated generic message, never a raw string.
- Hardcoded English injected at runtime — `book-appointment.js:300,314,334` and `view-appointment.js:170,184,190` ("Loading times...", "Couldn't load times...", "No times available this day.") plus the `" at "` separator (`book-appointment.js:328`, `view-appointment.js:290`). Add a helper + keys:

  In `js/language.js` (inside `switchLanguage`, after parsing): `window.i18nMap = translations;`
  Somewhere shared: `function t(key, fallback) { return (window.i18nMap && window.i18nMap[key]) || fallback; }`
  New keys (both files): `form.time.loading` ("Loading times..." / "Cargando horarios..."), `form.time.error` ("Couldn't load times. Please try again later." / "No pudimos cargar los horarios. Inténtalo más tarde."), `form.time.none` ("No times available this day." / "No hay horarios disponibles este día."), `common.at` ("at" / "a las").
- `book-appointment.js:292-297` (`showServiceRequiredError`) injects a `data-i18n` element but never re-translates → shows English to ES users. Call the same refresh `view-appointment.js:356` already has, or use `t('form.time.need-service', ...)` directly.

### 2.5 View-code hygiene — `js/view-appointment.js` + `view-appointment.html`

- **Scrub the code from the URL** (there is currently NO `history.replaceState` anywhere). Right after line 4 (`localStorage.setItem(...)`):
  ```js
  if (urlViewCode) history.replaceState(null, "", location.pathname);
  ```
  Keep this above any future analytics snippet.
- **Referrer meta** in `view-appointment.html` `<head>`:
  ```html
  <meta name="referrer" content="same-origin">
  ```
- Note: the code IS deliberately stored in localStorage (`book-appointment.js:185`, `view-appointment.js:4,248`) to power the "My Appointment" nav. Fine for a salon, but on a shared computer the next person can manage the previous booking. Keep or drop consciously — if you keep it, no code change.

### 2.6 Pin Flatpickr + Spanish locale — `book-appointment.html:22`, `view-appointment.html:23`

`https://cdn.jsdelivr.net/npm/flatpickr` floats to *latest* — a future breaking release kills the booking page with zero changes on your side. Pin it and add the ES locale:

```html
<script src="https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/flatpickr.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/l10n/es.js"></script>
```

Then in both flatpickr configs (`book-appointment.js:241`, `view-appointment.js:152`):

```js
locale: localStorage.getItem('ybs_lang') === 'es' ? 'es' : 'default',
```

(ES users currently get an English calendar and English dates in the confirmation modal.)

### 2.7 Validate the file before uploading — `js/book-appointment.js`

`accept=".png,.jpg,.jpeg,.webp"` only filters the picker dialog — **drag-and-drop bypasses it** (line 68 assigns `dataTransfer.files` unchecked). Add to `showFile` / the drop handler:

```js
if (file && (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024)) {
    fileInput.value = "";
    showFile(null);
    nameEl.textContent = t('form.hair-img.invalid', 'Please choose an image under 10 MB (PNG, JPG or WEBP).');
    return;
}
```

New keys: `form.hair-img.invalid` (EN above / ES: "Elige una imagen de menos de 10 MB (PNG, JPG o WEBP).").

### 2.8 Phone input fixes — `book-appointment.html:108-109`

The pattern demands exactly 10 digits with NO separators while the placeholder shows `123 456 7893` WITH spaces — users copying the shown format get rejected. Also missing autofill hints:

```html
<input type="tel" id="client-phone" required name="clientPhone" placeholder="123 456 7893"
    pattern="[\d\s\-\(\)]{10,14}" autocomplete="tel" maxlength="14">
```

And on the name input (line 104): `autocomplete="name" maxlength="100"`. On notes (line 174): `maxlength="500"`. **Match both maxlengths to your Spring `@Size` constraints.**

### 2.9 Remove the crash + PII logging

- `about.html:17` and `privacy-policy.html:14` include `js/home.js`, which throws `TypeError` at `home.js:19` on those pages (no `.toggle-btn-beauty` exists). Delete the `<script src="js/home.js" defer></script>` line from both files.
- Delete `console.log("Submitting appointment:", payload)` — `js/book-appointment.js:154` (logs customer name + phone).
- Delete `console.log('switching to', lang)` — `js/language.js:41` and `console.log(service)` — `js/home.js:25`.

### 2.10 Add `vercel.json` with security headers — repo root (new file)

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Content-Security-Policy-Report-Only", "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; font-src https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: https://res.cloudinary.com; connect-src 'self' https://YOUR-REAL-BACKEND-URL https://api.cloudinary.com; frame-src https://www.google.com" }
      ]
    }
  ]
}
```

Set `YOUR-REAL-BACKEND-URL`. CSP starts in **Report-Only** mode so a mistake can't break the site during launch week — watch the console on the live site, then rename the key to `Content-Security-Policy` once clean. (The `'unsafe-inline'` in script-src is forced by the inline `onclick=` handlers at `index.html:68`, `book-appointment.html:68,290,292`, `view-appointment.html:69,188`, `about.html:65`, `privacy-policy.html:63` — convert those to `addEventListener` later to drop it.)

### 2.11 Small i18n gaps

- `booking.hours.monday` is missing from BOTH locale files (used at `book-appointment.html:218`) — Monday never translates. Add `"booking.hours.monday": "Monday"` / `"Lunes"`.
- `es.json` has `"nav.home": "Home"` — should be `"Inicio"` (shows in the privacy page burger menu).

---

## PHASE 3 — Post-launch quality (first quiet week)

- **Optimize gallery/hero images** — `index.html:116,419-434`: only 1 of 7 gallery URLs uses `f_auto,q_auto`; the rest (and the hero) serve original phone-photo uploads. Insert `f_auto,q_auto,w_1200` (hero) / `f_auto,q_auto,w_800` (gallery) into each URL path like line 415 already does. Add `loading="lazy"` to gallery images.
- **Favicon** — none exists; every visit 404s `/favicon.ico`. Quick version on all 5 pages: `<link rel="icon" href="images/images.png">`.
- **Google Analytics decision** — GA is NOT installed anywhere, though the privacy policy (privacy-policy.html:227-234) describes it. Either add the gtag snippet to all pages (on view-appointment.html it must come AFTER the URL scrub from 2.5) or keep launching without it — the policy over-disclosing is harmless.
- **Contrast** — gold `#B08A52` on cream `#F6F1E8` = 2.83:1 (WCAG needs 4.5:1). Worst: `.status-booked` badge (`css/view-appointment.css:47`), `.story-heading` (`css/about.css:24`). A darker gold like `#8a6a35` (≈4.6:1) keeps the look.
- **Focus visibility** — `outline: none` with no replacement on `.book-btn` (`css/home.css:264`) and `.language-btn` (`css/global-layout.css:297`). Add `:focus-visible` rules (copy the pattern at `css/book-appointment.css:271-273`).
- **Keyboard access to the language switcher** — menu items are plain `<li>`/`<span>` (`index.html:41-48,89-91`), unreachable by keyboard. Put `<button>`s inside.
- **Modal behavior** — no Escape-to-close, no focus trap; success modal on booking page can't be closed via backdrop click (failure modal can).
- **Cloudinary cloud name** — `yfmlabi1` is hardcoded in the upload URL (`js/book-appointment.js:125`). Move to `js/config.js` or have the backend's signature response include it.
- **Dead code / artifacts** — commented-out blocks (`index.html:404-405`, `about.html:101`, `privacy-policy.html:147-148` — confirm the policy exclusions are intentional before deleting); stale "prototype" comment (`js/book-appointment.js:203-206`); unused `modalOverlay` (`js/book-appointment.js:176`); `datePIcker` typo (`js/book-appointment.js:241`); dead locale keys (`services.blowdry.time` in EN; `common.btn.book`, `privacy.eyebrow`, `privacy.title` in ES; no-op nested attrs `privacy.s04.to-opt-out`, `privacy.s04.to-get-help`, `privacy.s07.right-to-delete` in privacy-policy.html).
- **README.md** — UTF-16 encoded (renders as garbage on GitHub) and outdated (Lorem Picsum, nonexistent `appointments-owner.html`, wrong email). Re-save as UTF-8 and refresh. Gitignore `.vscode/`.
- **Content typos (ES)** — `about.html:96-99` + `es.json` `about.p`: "des"→"de", "adelate"→"adelante", "arreppentiras"→"arrepentirás", "tabajo"→"trabajo".
- **`language.js` robustness** — `js/language.js:5`: no error handling on the locale fetch; wrap in try/catch. It also re-fetches the JSON on every toggle (harmless, just wasteful).
