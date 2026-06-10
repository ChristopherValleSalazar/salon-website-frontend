const toggle = document.querySelector(".service-toggle");




toggle.addEventListener("click", () => {

    const barberSection = document.querySelector(".barber-services");
    const beautySection = document.querySelector(".beauty-services");
    
    const toggleButtonBeauty = document.querySelector(".toggle-btn-beauty")
    const toggleButtonBarber = document.querySelector(".toggle-btn-barber")

    toggle.classList.toggle("active");

    beautySection.classList.toggle("unselected");
    barberSection.classList.toggle("unselected");

    toggleButtonBeauty.classList.toggle("unfocus-color");
    toggleButtonBarber.classList.toggle("unfocus-color");

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
