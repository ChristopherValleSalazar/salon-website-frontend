const burgerMenu = document.getElementById("mobileMenu");
const burgerIconBtn = document.getElementById("burgerBtn");

function burgerBehaviour() {
    burgerIconBtn.classList.toggle("expanded");
    const isOpen = burgerMenu.classList.toggle("open");
    document.body.classList.toggle("no-scroll", isOpen);
}

document.addEventListener("click", (event) => {
    if (!burgerMenu.classList.contains("open")) return;

    if (!event.target.closest("#mobileMenu") && !event.target.closest("#burgerBtn")) {
        burgerMenu.classList.remove("open");
        burgerIconBtn.classList.remove("expanded");
        document.body.classList.remove("no-scroll");
    }
});