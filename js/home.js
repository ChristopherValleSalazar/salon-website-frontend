const serviceToggle = document.querySelector(".service-toggle");
const beautyBtn = document.querySelector(".toggle-btn-beauty");
const barberBtn = document.querySelector(".toggle-btn-barber");
const beautySection = document.querySelector(".beauty-services");
const barberSection = document.querySelector(".barber-services");

function selectCategory(category) {
    const isBarber = category === "barber";

    serviceToggle.classList.toggle("active", isBarber);

    barberSection.classList.toggle("unselected", !isBarber);
    beautySection.classList.toggle("unselected", isBarber);

    barberBtn.classList.toggle("unfocus-color", !isBarber);
    beautyBtn.classList.toggle("unfocus-color", isBarber);
}

beautyBtn.addEventListener("click", () => selectCategory("beauty"));
barberBtn.addEventListener("click", () => selectCategory("barber"));

document.querySelectorAll(".book-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const service = btn.dataset.service;
        console.log(service);
        window.location.href = `book-appointment.html?service=${service}`;
    });
});