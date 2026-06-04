const languageBtn = document.querySelector(".language-btn");
const languageMenu = document.querySelector(".language-menu");

languageBtn.addEventListener("click", () => {
    languageMenu.classList.toggle("show");
})

const options = document.querySelectorAll(".language-menu li");

options.forEach(option => {
    option.addEventListener("click", () => {

        const flag = option.querySelector(".fi").className;
        const text = option.textContent.trim();

        languageBtn.innerHTML = `
            <span class="${flag}"></span>
            <span>${text}</span>
            <span class="arrow">▼</span>
        `;

        languageMenu.classList.remove("show");

    });
});

document.addEventListener("click", (event) => {

    if (!event.target.closest(".language-dropdown")) {
        languageMenu.classList.remove("show");
    }

});