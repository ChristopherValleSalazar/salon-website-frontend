const toggle = document.querySelector(".service-toggle");
const barberSection = document.querySelector(".barber-services");
const beautySection = document.querySelector(".beauty-services");

toggle.addEventListener("click", () => {
    toggle.classList.toggle("active");
    beautySection.classList.toggle("unselected");
    barberSection.classList.toggle("unselected");
});

const cards = document.querySelectorAll(".card-container");

cards.forEach(card => {
    const cardMain = card.querySelector(".card-main");

    cardMain.addEventListener("click", () => {
        const cardTime = card.querySelector(".time-price-container");

        cardTime.classList.toggle("close");
        card.classList.toggle("open");
    });
});
