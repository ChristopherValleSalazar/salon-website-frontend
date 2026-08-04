let translations = {};
let currentLang = 'en';
const SUPPORTED = ['en', 'es'];
const cache = {};

const languageBtn = document.querySelector(".language-btn");
const languageMenu = document.querySelector(".language-menu");

// localStorage throws in Safari private mode; degrade to "no persistence" rather than
// letting the whole translation pass die.
let store = null;
try { store = window.localStorage; } catch { /* unavailable */ }
const readLang = () => { try { return store?.getItem('ybs_lang'); } catch { return null; } };
const writeLang = (v) => { try { store?.setItem('ybs_lang', v); } catch { /* ignore */ } };

export function t(key) {
    return translations[key] ?? key;
}

// Expose to classic (non-module) scripts. view-appointment.js needs switchLanguage to
// re-translate the content it injects after load.
window.t = t;
window.switchLanguage = switchLanguage;

// Attributes a translation can target, via data-i18n-<attr>.
const ATTRS = ['alt', 'aria-label', 'title', 'placeholder'];

export async function switchLanguage(lang) {
    if (!SUPPORTED.includes(lang)) lang = 'en';

    if (!cache[lang]) {
        const res = await fetch(`/locales/${lang}.json`);
        cache[lang] = await res.json();
    }
    translations = cache[lang];
    currentLang = lang;

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const val = translations[el.dataset.i18n];
        if (!val) return;

        if (el.hasAttribute('placeholder')) {
            el.placeholder = val;
        } else if (/<\/?[a-z][\s\S]*>/i.test(val)) {
            el.innerHTML = val;
        } else {
            el.textContent = val;
        }
    });

    // data-i18n-alt="key", data-i18n-aria-label="key", data-i18n-title="key", ...
    ATTRS.forEach(attr => {
        document.querySelectorAll(`[data-i18n-${attr}]`).forEach(el => {
            const val = translations[el.getAttribute(`data-i18n-${attr}`)];
            if (val) el.setAttribute(attr, val);
        });
    });

    const pageTitle = document.querySelector('title[data-i18n-title]');
    if (pageTitle) {
        const val = translations[pageTitle.getAttribute('data-i18n-title')];
        if (val) document.title = val;
    }

    document.documentElement.lang = lang;
    writeLang(lang);

    const selected = document.querySelector(`.language-menu li[data-lang="${lang}"]`);
    if (selected && languageBtn) {
        const flag = selected.querySelector('.fi')?.className ?? '';
        const text = selected.textContent.trim();
        languageBtn.innerHTML = `
            <span class="${flag}"></span>
            <span>${text}</span>
            <span class="language-arrow" aria-hidden="true">▼</span>
        `;
        languageBtn.setAttribute('aria-label', translations['a11y.language'] || 'Change language');
    }

    document.querySelectorAll('.language-menu li').forEach(li => {
        li.setAttribute('aria-selected', String(li.dataset.lang === lang));
    });

    // Only update state here — the click listeners are bound once, at load.
    document.querySelectorAll('.lang-opt').forEach(opt => {
        const active = opt.dataset.lang === lang;
        opt.classList.toggle('active', active);
        opt.setAttribute('aria-pressed', String(active));
    });

    document.dispatchEvent(new CustomEvent('languagechange', { detail: { lang } }));
}

// Bound once at load, not on every switch — re-binding inside switchLanguage made
// listeners accumulate, so one click fired the handler once per previous switch.
document.querySelectorAll('.lang-opt').forEach(opt => {
    opt.addEventListener('click', () => switchLanguage(opt.dataset.lang));
});

if (languageBtn && languageMenu) {
    languageBtn.addEventListener("click", () => {
        const open = languageMenu.classList.toggle("show");
        languageBtn.classList.toggle("color-hover", open);
        languageBtn.setAttribute("aria-expanded", String(open));
    });

    document.querySelectorAll(".language-menu li").forEach(option => {
        option.addEventListener("click", () => {
            languageMenu.classList.remove("show");
            languageBtn.classList.remove("color-hover");
            languageBtn.setAttribute("aria-expanded", "false");
            switchLanguage(option.dataset.lang);
        });
        option.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); option.click(); }
        });
    });

    document.addEventListener("click", (event) => {
        if (!event.target.closest(".language-dropdown")) {
            languageMenu.classList.remove("show");
            languageBtn.classList.remove("color-hover");
            languageBtn.setAttribute("aria-expanded", "false");
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && languageMenu.classList.contains("show")) {
            languageMenu.classList.remove("show");
            languageBtn.classList.remove("color-hover");
            languageBtn.setAttribute("aria-expanded", "false");
            languageBtn.focus();
        }
    });
}

(async () => {
    const saved = readLang();
    const browser = navigator.language?.split('-')[0];

    const lang = SUPPORTED.includes(saved)
        ? saved
        : SUPPORTED.includes(browser)
        ? browser
        : 'en';

    await switchLanguage(lang);
})();
