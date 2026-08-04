const burgerMenu = document.getElementById("mobileMenu");
const burgerIconBtn = document.getElementById("burgerBtn");

if (burgerMenu && burgerIconBtn) {
    const focusable = () => burgerMenu.querySelectorAll('a[href], button:not([disabled])');

    function setMenu(open) {
        burgerIconBtn.classList.toggle("expanded", open);
        burgerMenu.classList.toggle("open", open);
        document.body.classList.toggle("no-scroll", open);
        burgerIconBtn.setAttribute("aria-expanded", String(open));
        if (open) focusable()[0]?.focus();
    }

    const closeMenu = () => setMenu(false);

    burgerIconBtn.addEventListener("click", () => {
        setMenu(!burgerMenu.classList.contains("open"));
    });

    // Same-page anchors (#services, #gallery) don't navigate, so the menu would
    // otherwise stay open covering the content it just scrolled to.
    burgerMenu.querySelectorAll('a[href]').forEach(link => {
        link.addEventListener("click", closeMenu);
    });

    document.addEventListener("click", (event) => {
        if (!burgerMenu.classList.contains("open")) return;
        if (!event.target.closest("#mobileMenu") && !event.target.closest("#burgerBtn")) closeMenu();
    });

    document.addEventListener("keydown", (event) => {
        if (!burgerMenu.classList.contains("open")) return;

        if (event.key === "Escape") {
            closeMenu();
            burgerIconBtn.focus();
            return;
        }

        if (event.key === "Tab") {
            const items = focusable();
            if (!items.length) return;
            const first = items[0];
            const last = items[items.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    });
}
