// Analytics loader. Deliberately loads AFTER appointment-link.js has stripped ?c= from
// the URL, so a live appointment capability code can never reach page_location.
//
// To switch analytics on, replace MEASUREMENT_ID with the real GA4 id (G-XXXXXXXXXX).
// Until then nothing is requested and no cookie is set — which is also what the privacy
// policy currently states.
const MEASUREMENT_ID = 'G-REPLACE-ME';

// Always defined, so callers can use window.track?.() without caring whether analytics
// is configured or was blocked. A blocked or absent gtag must never break booking.
window.track = () => {};

if (/^G-[A-Z0-9]{6,}$/.test(MEASUREMENT_ID)) {
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', MEASUREMENT_ID, {
        anonymize_ip: true,
        // Belt and braces: never report a URL carrying a capability code, even if some
        // future entry point forgets to strip it.
        page_location: window.location.origin + window.location.pathname
    });

    window.track = (name, params) => {
        try { gtag('event', name, params || {}); } catch { /* blocked — ignore */ }
    };
}
