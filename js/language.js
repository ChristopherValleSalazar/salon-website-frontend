async function switchLanguage(lang) {
    const supported = ['en', 'es'];
    if (!supported.includes(lang)) lang = 'en';

    const res = await fetch(`/locales/${lang}.json`);
    const translations = await res.json();

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        const val = translations[key];
        if (!val) return;

        if (el.hasAttribute('placeholder')) {
            el.placeholder = val;
        } else if (el.dataset.i18nHtml) {
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

    document.querySelectorAll('.lang-opt').forEach(el => {
        el.classList.toggle('active', el.dataset.lang === lang);
    });
    console.log('switching to', lang);
}

const languageBtn = document.querySelector(".language-btn");
const languageMenu = document.querySelector(".language-menu");

languageBtn.addEventListener("click", () => {
    languageMenu.classList.toggle("show");
    languageBtn.classList.toggle("color-hover");
});

document.querySelectorAll(".language-menu li").forEach(option => {
    option.addEventListener("click", () => {
        const lang = option.dataset.lang;
        languageMenu.classList.remove("show");
        languageBtn.classList.remove("color-hover");

        const flag = option.querySelector(".fi").className;
        const text = option.textContent.trim();
        languageBtn.innerHTML = `
            <span class="${flag}"></span>
            <span>${text}</span>
            <span class="arrow">▼</span>
        `;

        switchLanguage(lang);
    });
});

document.addEventListener("click", (event) => {
    if (!event.target.closest(".language-dropdown")) {
        languageMenu.classList.remove("show");
        languageBtn.classList.remove("color-hover");
    }
});

document.querySelectorAll('.lang-opt').forEach(opt => {
    opt.addEventListener('click', () => {
        document.querySelectorAll('.lang-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        switchLanguage(opt.dataset.lang);
    });
});

(async () => {
    const saved = localStorage.getItem('ybs_lang');
    const browser = navigator.language?.split('-')[0];
    const supported = ['en', 'es'];

    const lang = supported.includes(saved)
        ? saved
        : supported.includes(browser)
        ? browser
        : 'en';

    await switchLanguage(lang);
})();