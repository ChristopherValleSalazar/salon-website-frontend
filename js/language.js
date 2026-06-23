function switchLanguage(lang) {
  //update flag, text, i18n
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