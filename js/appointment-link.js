(() => {
    let store = null;
    try { store = window.localStorage; } catch { /* Safari private mode */ }

    const params = new URLSearchParams(window.location.search);
    const urlViewCode = params.get("c");

    if (urlViewCode) {
        window.__viewCode = urlViewCode;
        try { store?.setItem("appointmentViewCode", urlViewCode); } catch { /* quota / private mode */ }

        params.delete("c");
        const query = params.toString();
        history.replaceState(
            null,
            "",
            window.location.pathname + (query ? "?" + query : "") + window.location.hash
        );
    }

    // Reveal the "My Appointment" nav links only when a booking view code is stored
    let stored = null;
    try { stored = store?.getItem("appointmentViewCode"); } catch { /* ignore */ }
    if (stored) {
        document.querySelectorAll(".appointment-nav-item").forEach(li => { li.hidden = false; });
    }
})();