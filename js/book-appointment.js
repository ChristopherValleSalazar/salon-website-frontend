import { t } from './language.js';

const today = new Date().getDay();
document.querySelector(`.day-container[data-day="${today}"]`)?.classList.add("is-today");


document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    const service = params.get("service");

    if (service) {
        const select = document.getElementById("service");

        if (select) {
            select.value = service;
            select.dispatchEvent(new Event("change"));
        }
    }
});

// Custom hair-image drop zone (desktop). Mobile keeps the native OS picker untouched.
const fileInput = document.getElementById("hair-image");
const fileDrop = document.getElementById("file-drop");

if (fileInput && fileDrop) {
    const thumb = fileDrop.querySelector(".file-drop-thumb");
    const nameEl = fileDrop.querySelector(".file-drop-name");
    const clearBtn = fileDrop.querySelector(".file-drop-clear");

    function showFile(file) {
        if (!file) {
            fileDrop.classList.remove("has-file");
            thumb.removeAttribute("src");
            nameEl.textContent = "";
            return;
        }

        nameEl.textContent = file.name;
        fileDrop.classList.add("has-file");

        if (file.type.startsWith("image/")) {
            const reader = new FileReader();
            reader.onload = (e) => { thumb.src = e.target.result; };
            reader.readAsDataURL(file);
        } else {
            thumb.removeAttribute("src");
        }
    }

    fileInput.addEventListener("change", () => showFile(fileInput.files[0]));

    clearBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        fileInput.value = "";
        showFile(null);
    });

    ["dragenter", "dragover"].forEach((ev) =>
        fileDrop.addEventListener(ev, (e) => {
            e.preventDefault();
            fileDrop.classList.add("is-dragover");
        })
    );
    ["dragleave", "dragend"].forEach((ev) =>
        fileDrop.addEventListener(ev, () => fileDrop.classList.remove("is-dragover"))
    );
    fileDrop.addEventListener("drop", (e) => {
        e.preventDefault();
        fileDrop.classList.remove("is-dragover");

        const dropped = e.dataTransfer.files;
        if (dropped && dropped.length) {
            fileInput.files = dropped;
            showFile(fileInput.files[0]);
        }
    });

    // Keep the custom UI in sync when the form is reset after a successful booking
    document.getElementById("appointment-form").addEventListener("reset", () => showFile(null));
}

const serviceSelector = document.getElementById("service");
const hairImageInput = document.getElementById("hair-image");
const hairImageLabel = document.querySelector(".hair-image-label");
const submitBtn = document.getElementById("book-app-btn");
const IMAGE_REQUIRED_SERVICES = new Set([
    "DYES", "BABY_HIGHLIGHT", "COLOR_TOUCH_UP", "TREATMENT_MOISTURIZING",
    "KERATIN_TREATMENT", "PERM"
])

function updateHairImageRequirement() {
    const needsImage = IMAGE_REQUIRED_SERVICES.has(serviceSelector.value);

    hairImageInput.required = needsImage;
    hairImageLabel.classList.toggle("is-required", needsImage);
}

serviceSelector.addEventListener("change", updateHairImageRequirement);

// One in-flight submission at a time. The flag guards against repeated Enter presses,
// which fire before the button's disabled state is painted.
let submitting = false;

async function uploadHairImage() {
    if (hairImageInput.files.length === 0) {
        return { imageUrl: null, imagePublicId: null };
    }

    const sigRes = await fetch(`${API_BASE_URL}/api/v1/uploads/signature`);
    if (!sigRes.ok) throw new ApiError("form.error.upload");
    const sig = await sigRes.json();

    const fd = new FormData();
    fd.append('file', hairImageInput.files[0]);
    fd.append('api_key', sig.apiKey);
    fd.append('timestamp', sig.timestamp);
    fd.append('signature', sig.signature);
    fd.append('folder', sig.folder);

    const res = await fetch(
        `https://api.cloudinary.com/v1_1/yfmlabi1/image/upload`,
        { method: 'POST', body: fd }
    );
    if (!res.ok) throw new ApiError("form.error.upload");

    const data = await res.json();
    return { imageUrl: data.secure_url, imagePublicId: data.public_id };
}

// Carries a translation key rather than a technical string, so the customer never
// sees "Failed to fetch".
class ApiError extends Error {
    constructor(key) { super(key); this.key = key; }
}

function readLang() {
    try {
        return localStorage.getItem("ybs_lang") || "en";
    } catch {
        return "en";
    }
}

document.getElementById("appointment-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitting) return;

    const phoneInput = document.getElementById("client-phone");
    const phoneError = document.getElementById("client-phone-error");
    const dateInput = document.getElementById("date-input");
    const timeInput = document.getElementById("time-input");
    const bookingWrapper = document.getElementById("booking-wrapper");

    // Accept any human phone format, then reduce to the 10 digits the API expects.
    const phoneDigits = phoneInput.value.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
    if (phoneDigits.length !== 10) {
        phoneError.hidden = false;
        phoneInput.setAttribute("aria-invalid", "true");
        phoneInput.setAttribute("aria-describedby", "client-phone-error");
        phoneInput.focus();
        return;
    }
    phoneError.hidden = true;
    phoneInput.removeAttribute("aria-invalid");

    if (!dateInput.value || !timeInput.value) {
        bookingWrapper.classList.add("input-error");
        bookingWrapper.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
        return;
    }
    bookingWrapper.classList.remove("input-error");

    // Lock the button synchronously, before any await — this is the whole point.
    submitting = true;
    setSubmitting(true);

    try {
        const { imageUrl, imagePublicId } = await uploadHairImage();

        const payload = {
            name: document.getElementById("customer-name").value,
            phoneNumber: phoneDigits,
            serviceType: document.getElementById("service").value,
            date: dateInput.value,
            startTime: timeInput.value,
            smsConsent: document.getElementById("consent-sms").checked,
            additionalNotes: document.getElementById("notes").value.trim() || null,
            hairImageUrl: imageUrl,
            hairImagePublicId: imagePublicId,
            language: readLang()
        };

        const resPost = await fetch(`${API_BASE_URL}/api/v1/appointments`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (resPost.ok) {
            modalBehaviour(await resPost.json());
        } else if (resPost.status === 409) {
            failureModalBehaviour(t("form.error.slot-taken"));
        } else if (resPost.status >= 500) {
            failureModalBehaviour(t("form.error.server"));
        } else {
            failureModalBehaviour(t("form.error.invalid"));
        }
    } catch (err) {
        // ApiError carries a key; anything else is a network/parse failure.
        failureModalBehaviour(t(err instanceof ApiError ? err.key : "form.error.network"));
    } finally {
        submitting = false;
        setSubmitting(false);
    }
});

function setSubmitting(busy) {
    submitBtn.disabled = busy;
    submitBtn.setAttribute("aria-busy", String(busy));
    // Drop data-i18n while busy so a language switch mid-request can't overwrite the
    // pending label; restore it afterwards.
    if (busy) {
        delete submitBtn.dataset.i18n;
        submitBtn.textContent = t("form.submitting");
    } else {
        submitBtn.dataset.i18n = "common.btn.appointment";
        submitBtn.textContent = t("common.btn.appointment");
    }
}

function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const modalOverlay = document.querySelector(".modal-overlay");

// SUCCESS MODAL
function modalBehaviour(appointment) {
    const modalOverlay = document.getElementById("success-modal-overlay");
    const closeBtn = document.getElementById("modal-btn-close");

    // The view code is the customer's key to see/cancel/reschedule this booking
    if (appointment.viewCode) {
        localStorage.setItem("appointmentViewCode", appointment.viewCode);
        document.querySelectorAll(".appointment-nav-item").forEach(li => { li.hidden = false; });
    }

    modalOverlay.querySelector(".customer-name").textContent = appointment.name;
    modalOverlay.querySelector(".detail-service").textContent = serviceLabel(appointment.serviceType);
    modalOverlay.querySelector(".detail-date").textContent = formatLongDate(appointment.date);
    modalOverlay.querySelector(".detail-time").textContent =
        formatTime(appointment.startTime) + " – " + formatTime(appointment.endTime);

    modalOverlay.classList.add("is-open");

    closeBtn.addEventListener("click", () => {
        document.getElementById("appointment-form").reset();
        modalOverlay.classList.remove("is-open");
    });
}

const failureOverlay = document.getElementById("failure-modal-overlay");
const failureMessageEl = document.getElementById("failure-modal-message");
let failurePlaceholder = failureMessageEl ? failureMessageEl.textContent : "";
let customMessageShown = false;

function failureModalBehaviour(message) {
    if (failureMessageEl) {
        if (message && message.trim()) {
            // Remember the translated placeholder before swapping in the backend message
            if (!customMessageShown) failurePlaceholder = failureMessageEl.textContent;
            failureMessageEl.textContent = message;
            customMessageShown = true;
        } else if (customMessageShown) {
            // No message this time — restore the placeholder we saved
            failureMessageEl.textContent = failurePlaceholder;
            customMessageShown = false;
        }
        // else: leave the existing (already translated) placeholder untouched
    }
    failureOverlay.classList.add("is-open");
}

function closeFailureModal() {
    failureOverlay.classList.remove("is-open");
}

if (failureOverlay) {
    document.getElementById("failure-modal-btn-retry").addEventListener("click", closeFailureModal);
    // Clicking the blurred backdrop also closes the modal
    failureOverlay.addEventListener("click", (e) => {
        if (e.target === failureOverlay) closeFailureModal();
    });
}

const datePIcker = flatpickr("#date-input", {
    inline: true,
    minDate: "today",
    maxDate: new Date().fp_incr(30), // 30 days from now
    allowInput: false,
    enableTime: false,
    dateFormat: "Y-m-d",
    disable: [
        date => date.getDay() === 1 //disable Mondays
    ],

    onChange(selectedDates, dateStr, instance) {
        // a new date invalidates any previously selected time
        clearTimeSelection();

        // slots depend on the service, so it has to be chosen first
        if (!serviceSelector.value) {
            showServiceRequiredError();
            return;
        }

        loadTimeSlots(dateStr);
    }
});

// Clear the booking card along with the rest of the form after a successful booking
const timeSlotContainer = document.querySelector(".container-time-slot");
const timeSlotEmptyStateHTML = timeSlotContainer.innerHTML;

document.getElementById("appointment-form").addEventListener("reset", () => {
    datePIcker.clear(false);
    clearTimeSelection();
    timeSlotContainer.innerHTML = timeSlotEmptyStateHTML;
});

// A different service means different slot spacing: drop the chosen time and refetch
serviceSelector.addEventListener("change", () => {
    serviceSelector.classList.remove("input-error");
    clearTimeSelection();

    if (datePIcker.selectedDates.length) {
        loadTimeSlots(datePIcker.formatDate(datePIcker.selectedDates[0], "Y-m-d"));
    } else {
        timeSlotContainer.innerHTML = timeSlotEmptyStateHTML;
    }
});

function clearTimeSelection() {
    document.getElementById("time-input").value = "";
    hideBookingSummary();
}

function showServiceRequiredError() {
    timeSlotContainer.innerHTML =
        `<p class="time-panel-empty time-panel-error">${t("form.time.need-service")}</p>`;
    serviceSelector.classList.add("input-error");
    serviceSelector.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function loadTimeSlots(dateStr) {
    timeSlotContainer.innerHTML = `<p class="time-panel-empty">${t("form.time.loading")}</p>`;;

    const params = new URLSearchParams({
        requestDate: dateStr,
        requestService: serviceSelector.value
    });

    try {
        const res = await fetch(`${API_BASE_URL}/api/v1/appointments/timeSlots?${params}`);
        if (!res.ok) throw new Error("Failed to load slots");

        const slots = await res.json();
        renderTimeSlots(timeSlotContainer, slots);
    } catch (err) {
        timeSlotContainer.innerHTML = `<p class="time-panel-empty">${t("form.time.error")}</p>`;
    }
}

function hideBookingSummary() {
    const summary = document.querySelector(".booking-summary");
    summary.hidden = true;
    summary.textContent = "";
}

function showBookingSummary(timeSlot) {
    const summary = document.querySelector(".booking-summary");
    summary.textContent =
        datePIcker.formatDate(datePIcker.selectedDates[0], "l, F j")
        + " at " + formatTime(timeSlot);
    summary.hidden = false;
}

function renderTimeSlots(container, slots) {
    if (slots.length === 0) {
        container.innerHTML = `<p class="time-panel-empty">${t("form.time.none")}
                <a class="time-panel-phone" href="tel:+13239075658">(323) 907-5658</a>
            </p>`;
        return;
    }

    container.innerHTML = "";
    slots.forEach(slot => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "slot-button";
        btn.textContent = formatTime(slot.availableTimeSlot);

        btn.addEventListener("click", () => {
            document.getElementById("time-input").value = slot.availableTimeSlot;
            document.getElementById("booking-wrapper").classList.remove("input-error");
            showBookingSummary(slot.availableTimeSlot);

            container.querySelectorAll(".slot-button").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");
        });
        container.appendChild(btn);
    });
}

// The option label doubles as the display name (and is already translated)
function serviceLabel(serviceType) {
    const option = serviceSelector.querySelector(`option[value="${serviceType}"]`);
    return option ? option.textContent.trim() : serviceType;
}

function formatLongDate(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return datePIcker.formatDate(new Date(y, m - 1, d), "l, F j, Y");
}

function formatTime(timeStr) {
    const [h, m] = timeStr.split(":");
    const d = new Date();
    d.setHours(h, m);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}