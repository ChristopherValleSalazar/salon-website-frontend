// Single source of truth for the API origin. Every fetch in the app reads this.
//
// !! DEPLOY BLOCKER !! The previous value was `http://chris-fedora:8080` — a LAN
// machine name that resolves for no customer device, so no booking could ever be
// submitted. Replace the value below with the public origin of the deployed Spring
// Boot API, then verify with:
//
//   curl -sS "<origin>/api/v1/appointments/timeSlots?requestDate=2026-08-05&requestService=HAIRCUT"
//
// A JSON array means the origin is correct. Note the API's CORS config
// (SecurityConfig#corsConfigurationSource) must list this site's origin in
// `app.cors.allowed-origins`, or every request fails at the preflight.
const API_BASE_URL = 'https://REPLACE-WITH-DEPLOYED-API-HOST';
