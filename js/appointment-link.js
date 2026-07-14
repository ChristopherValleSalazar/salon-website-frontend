// Reveal the "My Appointment" nav links only when a booking view code is stored
(() => {
    if (localStorage.getItem("appointmentViewCode")) {
        document.querySelectorAll(".appointment-nav-item").forEach(li => { li.hidden = false; });
    }
})();
