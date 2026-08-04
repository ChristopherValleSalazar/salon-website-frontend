let translations = {};
let currentLang = 'en';
const SUPPORTED = ['en', 'es'];
const cache = {};

const languageBtn = document.querySelector(".language-btn");
const languageMenu = document.querySelector(".language-menu");

export function t(key) {
    return translations[key] ?? key;
}

// Expose the lookup to classic (non-module) scripts so they can translate
window.t = t;

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

    document.documentElement.lang = lang;
    localStorage.setItem('ybs_lang', lang);

    const selected = document.querySelector(`.language-menu li[data-lang="${lang}"]`);
    if (selected) {
        const flag = selected.querySelector('.fi').className;
        const text = selected.textContent.trim();
        languageBtn.innerHTML = `
            <span class="${flag}"></span>
            <span>${text}</span>
            <span class="arrow">▼</span>
        `;
    }

    document.querySelectorAll('.lang-opt').forEach(opt => {
        opt.addEventListener('click', () => switchLanguage(opt.dataset.lang));
        opt.classList.toggle('active', opt.dataset.lang === lang);
    });

    document.dispatchEvent(new CustomEvent('languagechange', { detail: { lang } }));
}

languageBtn.addEventListener("click", () => {
    languageMenu.classList.toggle("show");
    languageBtn.classList.toggle("color-hover");
});

document.querySelectorAll(".language-menu li").forEach(option => {
    option.addEventListener("click", () => {
        languageMenu.classList.remove("show");
        languageBtn.classList.remove("color-hover");
        switchLanguage(option.dataset.lang);
    });
});

document.addEventListener("click", (event) => {
    if (!event.target.closest(".language-dropdown")) {
        languageMenu.classList.remove("show");
        languageBtn.classList.remove("color-hover");
    }
});

(async () => {
    const saved = localStorage.getItem('ybs_lang');
    const browser = navigator.language?.split('-')[0];

    const lang = SUPPORTED.includes(saved)
        ? saved
        : SUPPORTED.includes(browser)
        ? browser
        : 'en';

    await switchLanguage(lang);
})();