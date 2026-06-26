function burgerBehaviour() {
    const burgerMenu = document.getElementById("mobileMenu");
    const burgerIconBtn = document.getElementById('burgerBtn');

    burgerIconBtn.classList.toggle("expanded");
    burgerMenu.classList.toggle("open");

    document.addEventListener("click", (event) => {
        if (!event.target.closest(burgerMenu)) {
            burgerMenu.classList.remove("open");
            burgerIconBtn.classList.remove("expanded");
        }
    })
}


