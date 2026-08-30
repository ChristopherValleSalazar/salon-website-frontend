// language.js exposes t() on window; this page is a classic script, not a module.
function tr(key) {
    return (typeof window.t === "function") ? window.t(key) : key;
}

// The API answers failures with { type, error }. `type` is the exception's simple
// name — stable and safe to switch on — while `error` is hardcoded English written
// for developers. Map the type to a key so the customer sees their own language.
const API_ERROR_KEYS = {
    SlotUnavailableException:         "form.error.slot-taken",
    SlotIsMondayException:            "view.error.monday",
    PastDateException:                "view.error.past-date",
    OutsideServiceHoursException:     "view.error.outside-hours",
    EndsAfterClosingException:        "view.error.after-closing",
    InvalidAppointmentStateException: "view.error.already-in-state",
    CancellationTooLateException:     "view.error.too-late",
    AppointmentNotFoundException:     "view.error.not-found"
};

// Anything unmapped still gets a translated message rather than a backend string.
function showApiFailure(body, status) {
    showFailureModal(API_ERROR_KEYS[body && body.type]
        || (status >= 500 ? "form.error.server" : "form.error.invalid"));
}

let storage = null;
try { storage = window.localStorage; } catch { /* Safari private mode */ }

let viewCode = window.__viewCode || (() => {
    try { return storage?.getItem("appointmentViewCode"); } catch { return null; }
})();
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
        const res = await fetch(`${API_BASE_URL}/api/v1/appointments/view?code=${encodeURIComponent(viewCode)}`,
            {
                signal: AbortSignal.timeout(10_000)
            }
        );

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
    try { storage?.removeItem("appointmentViewCode"); } catch { /* ignore */ }
    document.querySelectorAll(".appointment-nav-item").forEach(li => { li.hidden = true; });
}

function renderAppointment() {
    loadingEl.hidden = true;
    missingEl.hidden = true;
    infoEl.hidden = false;

    document.querySelector(".appointment-name").textContent = appointment.name;
    document.querySelector(".detail-service").textContent = formatServices(appointment.services);
    document.querySelector(".detail-date").textContent = appointment.formattedDate;
    document.querySelector(".detail-time").textContent =
        formatTime(appointment.formattedStartTime) + " - " + formatTime(appointment.formattedEndTime);

    updateStatus(appointment.status);
    refreshTranslations();
}

function updateStatus(status) {
    appointment.status = status;

    const badge = document.querySelector(".status-badge");
    const statusKey = status.toLowerCase();
    badge.className = "status-badge status-" + statusKey;
    const labelKey = "view.status." + statusKey;
    badge.dataset.i18n = labelKey;
    // Translated on every call, so setActionsBusy() re-running this after an action
    // no longer drops the badge back to English. tr() returns the key when nothing
    // matches, in which case the enum is prettified instead.
    const label = tr(labelKey);
    badge.textContent = label === labelKey
        ? statusKey.replace(/_/g, " ").replace(/^./, c => c.toUpperCase())
        : label;

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
            { method: "POST",
                signal: AbortSignal.timeout(10_000)
             }
        );

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            showApiFailure(body, res.status);
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
        // err.message here is the browser's own "Failed to fetch", not customer copy.
        showFailureModal("form.error.network");
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
            date => date.getDay() === 1, //disable Mondays
            date => isPastClosingTime(date)
        ],

        onChange(selectedDates, dateStr) {
            clearTimeSelection();
            loadTimeSlots(dateStr);
        }
    });
}

//function to disable current time if past the closing time of the salon
function  isPastClosingTime(date) {
    // Apply the cutoff using Los Angeles local time. Monday remains
            // controlled by the rule above.
            const laParts = new Intl.DateTimeFormat("en-US", {
                timeZone: "America/Los_Angeles",
                year: "numeric",
                month: "numeric",
                day: "numeric",
                hour: "numeric",
                hour12: false
            }).formatToParts(new Date());
            const la = Object.fromEntries(
                laParts
                    .filter(part => part.type !== "literal")
                    .map(part => [part.type, Number(part.value)])
            );
            const isToday = date.getFullYear() === la.year
                && date.getMonth() + 1 === la.month
                && date.getDate() === la.day;
            const weekday = date.getDay();
            const cutoffHour = weekday === 0 ? 15 : 19;

            return isToday
                && ((weekday >= 2 && weekday <= 6) || weekday === 0)
                && la.hour >= cutoffHour;
}

let loadingSlots = false; // Flag to prevent fetching multiple times before first request is completed

async function loadTimeSlots(dateStr) {
    timeSlotContainer.innerHTML = `<p class="time-panel-empty">${tr("form.time.loading")}</p>`;

    const params = new URLSearchParams({
        requestDate: dateStr,
        requestServices: appointment.services
    });

    if(loadingSlots) {
        return; // if slots are loading, exit to prevent multiple fetches
    }
    loadingSlots = true;

    try {
        const res = await fetch(`${API_BASE_URL}/api/v1/appointments/timeSlots?${params}`
            , { signal: AbortSignal.timeout(10_000) }
        );
        if (!res.ok) throw new Error("Failed to load slots");

        const slots = await res.json();
        renderTimeSlots(slots);
    } catch (err) {
        timeSlotContainer.innerHTML = `<p class="time-panel-empty">${tr("form.time.error")}</p>`;
    } finally {
        loadingSlots = false; // Reset the flag after the request is completed
    }
}

function renderTimeSlots(slots) {
    if (slots.length === 0) {
        // Same treatment as the booking page: the copy ends mid-sentence and the
        // phone number is appended as a link.
        timeSlotContainer.innerHTML = `<p class="time-panel-empty">${tr("form.time.none")}
                <a class="time-panel-phone" href="tel:+13239075658">(323) 907-5658</a>
            </p>`;
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
                signal: AbortSignal.timeout(10_000),
                body: JSON.stringify({ date: dateVal, startTime: timeVal })
            }
        );

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            showApiFailure(body, res.status);
            return;
        }

        const body = await res.json(); // { date, startTime, endTime, viewCode }

        // Rescheduling creates a fresh appointment with a fresh code — swap it in
        if (body.viewCode) {
            viewCode = body.viewCode;
            try { storage?.setItem("appointmentViewCode", viewCode); } catch { /* ignore */ }
        }

        appointment.date = body.formattedDate;
        appointment.startTime = body.formattedStartTime;
        appointment.endTime = body.formattedEndTime;
        appointment.status = "BOOKED";
        renderAppointment();

        reschedulePanel.hidden = true;
        reschedulePicker.clear(false);
        clearTimeSelection();
        timeSlotContainer.innerHTML = timeSlotEmptyStateHTML;

        showSuccessModal({
            titleKey: "view.modal.rescheduled.heading",
            titleText: "Appointment rescheduled!",
            messageText: body.formattedDate + " · "
                + (body.formattedStartTime) + " - " + (body.formattedEndTime)
        });
        console.log("Rescheduled to " + body.formattedDate + " " + body.formattedStartTime + " - " + body.formattedEndTime);
    } catch (err) {
        // err.message here is the browser's own "Failed to fetch", not customer copy.
        console.log(err + " " + err.stack);
        showFailureModal("form.error.network");
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
        + " " + tr("common.at") + " " + formatTime(timeSlot);
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

// Keep data-i18n AND fill the text now in the active language via the global t() helper.
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

// Takes a translation key, not a message: keeping data-i18n on the element means
// the [data-i18n] sweep retranslates it on a language switch, and a later failure
// can never inherit the previous one's text.
function showFailureModal(key) {
    const messageKey = key || "modal.fail.message";
    failureMessageEl.dataset.i18n = messageKey;
    failureMessageEl.textContent = tr(messageKey);
    failureOverlay.classList.add("is-open");
}

document.getElementById("failure-modal-btn-retry").addEventListener("click", () => {
    failureOverlay.classList.remove("is-open");
});
failureOverlay.addEventListener("click", (e) => {
    if (e.target === failureOverlay) failureOverlay.classList.remove("is-open");
});

// HELPERS
// Service names come from formatServices() in services.js. This line is written
// by JS, so the [data-i18n] sweep never touches it — it is re-rendered here on a
// language switch instead. Only the text is rewritten: calling back into
// refreshTranslations() would re-dispatch languagechange and loop.
document.addEventListener("languagechange", () => {
    if (appointment) {
        document.querySelector(".detail-service").textContent = formatServices(appointment.services);
    }
});

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