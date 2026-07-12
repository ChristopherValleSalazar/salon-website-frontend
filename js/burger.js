const burgerMenu = document.getElementById("mobileMenu");
const burgerIconBtn = document.getElementById("burgerBtn");

function burgerBehaviour() {
    burgerIconBtn.classList.toggle("expanded");
    burgerMenu.classList.toggle("open");
}

document.addEventListener("click", (event) => {
    if (!burgerMenu.classList.contains("open")) return;

    if (!event.target.closest("#mobileMenu") && !event.target.closest("#burgerBtn")) {
        burgerMenu.classList.remove("open");
        burgerIconBtn.classList.remove("expanded");
    }
});