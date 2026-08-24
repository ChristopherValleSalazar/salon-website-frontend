// Service enum -> translation key.
//
// The booking page carries these keys on its checkbox rows, but the view page has
// no picker markup to read them from, so the mapping lives here and both pages
// share one formatter. Loaded as a classic script (like config.js) because
// view-appointment.js is not a module.

const SERVICE_LABEL_KEYS = {
    HAIRCUT:                            "form.services.haircut",
    BABY_HIGHLIGHT:                     "form.services.baby-highlight",
    DYES:                               "form.services.dyes",
    KERATIN_TREATMENT:                  "form.services.keratin",
    BLOW_DRYING:                        "form.services.blowdry",
    WASHING:                            "form.services.washing",
    TREATMENT_MOISTURIZING:             "form.services.treatment",
    HAIRCUT_BLOW_DRY:                   "form.services.haircut-blowdry",
    COLOR_TOUCH_UP:                     "form.services.color-touchup",
    PERM:                               "form.services.perm",
    BEARD_TRIM:                         "form.services.beard-trim",
    EYEBROW_SHAPING:                    "form.services.eyebrow-shaping",
    HAIRCUT_BEARD_TRIM:                 "form.services.haircut-beard-trim",
    HAIRCUT_BEARD_TRIM_EYEBROW_SHAPING: "form.services.haircut-beard-trim-eyebrow-shaping",
};

// Translated, comma-joined label for one or more service enums.
// Accepts an array or a single value so every caller can hand it whatever the
// API gave them.
function formatServices(services) {
    const list = Array.isArray(services) ? services : [services];
    const separator = translateService("form.services.separator") || ", ";

    return list.map(service => {
        const key = SERVICE_LABEL_KEYS[service];
        const label = key ? translateService(key) : null;
        // An unrecognised value still has to read as something, so fall back to
        // title-casing the enum rather than printing it raw.
        return label || prettifyServiceEnum(service);
    }).join(separator);
}

// t() lives on window once language.js has run, and returns the key itself when
// a translation is missing — which is not a label worth showing.
function translateService(key) {
    if (typeof window.t !== "function") return null;
    const value = window.t(key);
    return value === key ? null : value;
}

function prettifyServiceEnum(service) {
    return String(service).toLowerCase().split("_")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}
