// The magic-link code from the SMS URL always wins and refreshes the stored one;
// otherwise fall back to the code saved when the appointment was booked.
const urlViewCode = new URLSearchParams(window.location.search).get("c");
if (urlViewCode) localStorage.setItem("appointmentViewCode", urlViewCode);

let viewCode = urlViewCode || localStorage.getItem("appointmentViewCode");
let appointment = null;

const loadingEl = document.querySelector(".appointment-loading");
const infoEl = document.querySelector(".appointment-info");
const missingEl = document.querySelector(".appointment-missing");

const confirmBtn = document.getElementById("confirm-btn");
const cancelBtn = document.getElementById("cancel-btn");
const rescheduleBtn = document.getElementById("reschedule-btn");
const reschedulePanel = document.querySelector(".reschedule-panel");
const rescheduleSubmit = document.getElementById("reschedule-submit");
const timeSlotContainer = document.querySelector(".container-time-slot");
const timeSlotEmptyStateHTML = timeSlotContainer.innerHTML;

loadAppointment();

async function loadAppointment() {
    if (!viewCode) {
        showMissing();
        return;
    }

    try {
        const res = await fetch(`${API_BASE_URL}/api/v1/appointments/view?code=${encodeURIComponent(viewCode)}`);

        if (!res.ok) {
            // The code is dead (past date, canceled, or rescheduled) — stop offering it
            if (res.status === 404) forgetViewCode();
            showMissing();
            return;
        }

        appointment = await res.json();
        renderAppointment();
    } catch (err) {
        showMissing();
    }
}

function showMissing() {
    loadingEl.hidden = true;
    infoEl.hidden = true;
    missingEl.hidden = false;
}

function forgetViewCode() {
    localStorage.removeItem("appointmentViewCode");
    document.querySelectorAll(".appointment-nav-item").forEach(li => { li.hidden = true; });
}

function renderAppointment() {
    loadingEl.hidden = true;
    missingEl.hidden = true;
    infoEl.hidden = false;

    document.querySelector(".appointment-name").textContent = appointment.name;
    document.querySelector(".detail-service").textContent = serviceLabel(appointment.serviceType);
    document.querySelector(".detail-date").textContent = formatLongDate(appointment.date);
    document.querySelector(".detail-time").textContent =
        formatTime(appointment.startTime) + " – " + formatTime(appointment.endTime);

    updateStatus(appointment.status);
    refreshTranslations();
}

function updateStatus(status) {
    appointment.status = status;

    const badge = document.querySelector(".status-badge");
    const statusKey = status.toLowerCase();
    badge.className = "status-badge status-" + statusKey;
    badge.dataset.i18n = "view.status." + statusKey;
    badge.textContent = statusKey.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());

    // Only BOOKED can still be confirmed; anything past CONFIRMED is terminal
    confirmBtn.disabled = status !== "BOOKED";
    const actionable = status === "BOOKED" || status === "CONFIRMED";
    cancelBtn.disabled = !actionable;
    rescheduleBtn.disabled = !actionable;
    if (!actionable) reschedulePanel.hidden = true;
}

function setActionsBusy(busy) {
    if (busy) {
        [confirmBtn, cancelBtn, rescheduleBtn, rescheduleSubmit].forEach(b => { b.disabled = true; });
    } else {
        rescheduleSubmit.disabled = false;
        updateStatus(appointment.status);
    }
}

// CONFIRM / CANCEL
confirmBtn.addEventListener("click", () => sendCancelOrConfirm("CONFIRM"));
cancelBtn.addEventListener("click", () => sendCancelOrConfirm("CANCEL"));

async function sendCancelOrConfirm(action) {
    setActionsBusy(true);

    try {
        const res = await fetch(
            `${API_BASE_URL}/api/v1/appointments/cancelOrConfirm?action=${action}&code=${encodeURIComponent(viewCode)}`,
            { method: "POST" }
        );

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            showFailureModal(body.error);
            return;
        }

        const body = await res.json(); // { status }
        updateStatus(body.status);

        if (body.status === "CANCELED") {
            forgetViewCode(); // the code dies with the appointment
            showSuccessModal({
                titleKey: "view.modal.canceled.heading",
                titleText: "Appointment canceled",
                messageKey: "view.modal.canceled.message",
                messageText: "Your appointment has been canceled. We hope to see you again soon."
            });
        } else {
            showSuccessModal({
                titleKey: "view.modal.confirmed.heading",
                titleText: "Appointment confirmed!",
                messageKey: "view.modal.confirmed.message",
                messageText: "We look forward to seeing you. You'll receive a reminder the day before."
            });
        }
    } catch (err) {
        showFailureModal(err.message);
    } finally {
        setActionsBusy(false);
    }
}

// RESCHEDULE — the calendar + time picker only exists once the button is clicked
let reschedulePicker = null;

rescheduleBtn.addEventListener("click", () => {
    reschedulePanel.hidden = !reschedulePanel.hidden;
    if (!reschedulePanel.hidden && !reschedulePicker) initReschedulePicker();
});

function initReschedulePicker() {
    reschedulePicker = flatpickr("#date-input", {
        inline: true,
        minDate: "today",
        allowInput: false,
        enableTime: false,
        dateFormat: "Y-m-d",
        disable: [
            date => date.getDay() === 1 //disable Mondays
        ],

        onChange(selectedDates, dateStr) {
            clearTimeSelection();
            loadTimeSlots(dateStr);
        }
    });
}

async function loadTimeSlots(dateStr) {
    timeSlotContainer.innerHTML = "<p class='time-panel-empty'>Loading times...</p>";

    const params = new URLSearchParams({
        requestDate: dateStr,
        requestService: appointment.serviceType
    });

    try {
        const res = await fetch(`${API_BASE_URL}/api/v1/appointments/timeSlots?${params}`);
        if (!res.ok) throw new Error("Failed to load slots");

        const slots = await res.json();
        renderTimeSlots(slots);
    } catch (err) {
        timeSlotContainer.innerHTML = "<p class='time-panel-empty'>Couldn't load times. Please try again later.</p>";
    }
}

function renderTimeSlots(slots) {
    if (slots.length === 0) {
        timeSlotContainer.innerHTML = "<p class='time-panel-empty'>No times available this day.</p>";
        return;
    }

    timeSlotContainer.innerHTML = "";
    slots.forEach(slot => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "slot-button";
        btn.textContent = formatTime(slot.availableTimeSlot);

        btn.addEventListener("click", () => {
            document.getElementById("time-input").value = slot.availableTimeSlot;
            document.getElementById("booking-wrapper").classList.remove("input-error");
            showBookingSummary(slot.availableTimeSlot);

            timeSlotContainer.querySelectorAll(".slot-button").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");
        });
        timeSlotContainer.appendChild(btn);
    });
}

rescheduleSubmit.addEventListener("click", async () => {
    const dateVal = document.getElementById("date-input").value;
    const timeVal = document.getElementById("time-input").value;
    const bookingWrapper = document.getElementById("booking-wrapper");

    if (!dateVal || !timeVal) {
        bookingWrapper.classList.add("input-error");
        bookingWrapper.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
    }
    bookingWrapper.classList.remove("input-error");

    setActionsBusy(true);

    try {
        const res = await fetch(
            `${API_BASE_URL}/api/v1/appointments/reschedule?code=${encodeURIComponent(viewCode)}`,
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ date: dateVal, startTime: timeVal })
            }
        );

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            showFailureModal(body.error);
            return;
        }

        const body = await res.json(); // { date, startTime, endTime, viewCode }

        // Rescheduling creates a fresh appointment with a fresh code — swap it in
        if (body.viewCode) {
            viewCode = body.viewCode;
            localStorage.setItem("appointmentViewCode", viewCode);
        }

        appointment.date = body.date;
        appointment.startTime = body.startTime;
        appointment.endTime = body.endTime;
        appointment.status = "BOOKED";
        renderAppointment();

        reschedulePanel.hidden = true;
        reschedulePicker.clear(false);
        clearTimeSelection();
        timeSlotContainer.innerHTML = timeSlotEmptyStateHTML;

        showSuccessModal({
            titleKey: "view.modal.rescheduled.heading",
            titleText: "Appointment rescheduled!",
            messageText: formatLongDate(body.date) + " · "
                + formatTime(body.startTime) + " – " + formatTime(body.endTime)
        });
    } catch (err) {
        showFailureModal(err.message);
    } finally {
        setActionsBusy(false);
    }
});

function clearTimeSelection() {
    document.getElementById("time-input").value = "";
    hideBookingSummary();
}

function hideBookingSummary() {
    const summary = document.querySelector(".booking-summary");
    summary.hidden = true;
    summary.textContent = "";
}

function showBookingSummary(timeSlot) {
    const summary = document.querySelector(".booking-summary");
    summary.textContent =
        reschedulePicker.formatDate(reschedulePicker.selectedDates[0], "l, F j")
        + " at " + formatTime(timeSlot);
    summary.hidden = false;
}

// MODALS (same look as the booking page; text is set per action)
function showSuccessModal({ titleKey, titleText, messageKey, messageText }) {
    const titleEl = document.getElementById("success-modal-title");
    const messageEl = document.getElementById("success-modal-message");

    titleEl.dataset.i18n = titleKey;
    titleEl.textContent = titleText;

    if (messageKey) {
        messageEl.dataset.i18n = messageKey;
    } else {
        // dynamic text (e.g. the new date/time) must survive language switches
        delete messageEl.dataset.i18n;
    }
    messageEl.textContent = messageText;

    document.getElementById("success-modal-overlay").classList.add("is-open");
    refreshTranslations();
}

document.getElementById("modal-btn-close").addEventListener("click", () => {
    document.getElementById("success-modal-overlay").classList.remove("is-open");
});

const failureOverlay = document.getElementById("failure-modal-overlay");
const failureMessageEl = document.getElementById("failure-modal-message");

function showFailureModal(message) {
    if (message && message.trim()) {
        delete failureMessageEl.dataset.i18n;
        failureMessageEl.textContent = message;
    }
    failureOverlay.classList.add("is-open");
}

document.getElementById("failure-modal-btn-retry").addEventListener("click", () => {
    failureOverlay.classList.remove("is-open");
});
failureOverlay.addEventListener("click", (e) => {
    if (e.target === failureOverlay) failureOverlay.classList.remove("is-open");
});

// HELPERS
function serviceLabel(serviceType) {
    return serviceType.toLowerCase().split("_")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

function formatLongDate(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return flatpickr.formatDate(new Date(y, m - 1, d), "l, F j, Y");
}

function formatTime(timeStr) {
    const [h, m] = timeStr.split(":");
    const d = new Date();
    d.setHours(h, m);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Re-apply translations to elements injected after page load
function refreshTranslations() {
    if (typeof switchLanguage === "function") {
        switchLanguage(localStorage.getItem("ybs_lang") || document.documentElement.lang || "en");
    }
}
