// The magic-link code from the SMS URL always refreshes the stored one;
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

// CONFIRM / CANCEL — a confirmation dialog now sits between the click and the request
confirmBtn.addEventListener("click", () => openConfirmDialog("confirm"));
cancelBtn.addEventListener("click", () => openConfirmDialog("cancel"));

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
        maxDate: new Date().fp_incr(30),
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

rescheduleSubmit.addEventListener("click", () => {
    const dateVal = document.getElementById("date-input").value;
    const timeVal = document.getElementById("time-input").value;
    const bookingWrapper = document.getElementById("booking-wrapper");

    // validate the picked slot before the "are you sure?" dialog ever opens
    if (!dateVal || !timeVal) {
        bookingWrapper.classList.add("input-error");
        bookingWrapper.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
    }
    bookingWrapper.classList.remove("input-error");

    openConfirmDialog("reschedule");
});

async function submitReschedule() {
    const dateVal = document.getElementById("date-input").value;
    const timeVal = document.getElementById("time-input").value;

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
}

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

// CONFIRM DIALOG (native <dialog>) — one action table keyed by the action string holds
// each action's copy AND its handler, so a new action is a single new entry
const confirmDialog = document.getElementById("confirm-dialog");
const confirmDialogTitle = document.getElementById("confirm-dialog-title");
const confirmDialogMessage = document.getElementById("confirm-dialog-message");
const confirmDialogProceed = document.getElementById("confirm-dialog-proceed");
let pendingAction = null;

const CONFIRM_ACTIONS = {
    confirm: {
        titleKey: "view.confirm.dialog.confirm.heading",
        messageKey: "view.confirm.dialog.confirm.message",
        proceedKey: "view.confirm.dialog.confirm.proceed",
        run: () => sendCancelOrConfirm("CONFIRM"),
    },
    cancel: {
        titleKey: "view.confirm.dialog.cancel.heading",
        messageKey: "view.confirm.dialog.cancel.message",
        proceedKey: "view.confirm.dialog.cancel.proceed",
        danger: true,
        run: () => sendCancelOrConfirm("CANCEL"),
    },
    reschedule: {
        titleKey: "view.confirm.dialog.reschedule.heading",
        proceedKey: "view.confirm.dialog.reschedule.proceed",
        // dynamic date/time instead of a static messageKey; reuse formatLongDate/formatTime
        dynamicMessage: () =>
            formatLongDate(document.getElementById("date-input").value)
            + " · " + formatTime(document.getElementById("time-input").value),
        run: submitReschedule,
    },
};

function openConfirmDialog(action) {
    const cfg = CONFIRM_ACTIONS[action];
    pendingAction = action;

    setDialogText(confirmDialogTitle, cfg.titleKey);
    setDialogText(confirmDialogProceed, cfg.proceedKey);

    // a keyed message keeps its data-i18n; a dynamic one drops data-i18n so a language
    // switch won't overwrite it, exactly like showSuccessModal()
    if (cfg.messageKey) {
        setDialogText(confirmDialogMessage, cfg.messageKey);
    } else {
        delete confirmDialogMessage.dataset.i18n;
        confirmDialogMessage.textContent = cfg.dynamicMessage();
    }

    confirmDialog.classList.toggle("is-danger", !!cfg.danger);
    confirmDialog.showModal();   // native modal: backdrop, focus-trap, ESC-to-close
}

// Keep data-i18n (so a later language toggle re-translates the open dialog via
// language.js) AND fill the text now in the active language via the global t() helper.
function setDialogText(el, key) {
    el.dataset.i18n = key;
    el.textContent = (typeof window.t === "function") ? window.t(key) : el.textContent;
}

// The form's buttons close the dialog natively and set returnValue; dispatch on close so
// the dialog finishes its focus-return first, then only "confirm" fires the action's run()
confirmDialog.addEventListener("close", () => {
    const action = pendingAction;
    pendingAction = null;
    if (confirmDialog.returnValue === "confirm") CONFIRM_ACTIONS[action].run();
});

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
