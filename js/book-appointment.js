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

// ---------------------------------------------------------------------------
// Hair reference photos
// Desktop (>=601px) uses the custom drag-and-drop zone, mobile (<=600px) the
// native OS picker. Both funnel into the same selectedFiles array.
// ---------------------------------------------------------------------------

const MAX_IMAGES = 3;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
// Fallback for pickers that hand over a file with an empty `type`.
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

// Services that cannot be booked without at least one reference photo.
const IMAGE_REQUIRED_SERVICES = new Set([
    "DYES", "BABY_HIGHLIGHT", "COLOR_TOUCH_UP", "TREATMENT_MOISTURIZING",
    "KERATIN_TREATMENT", "PERM"
]);

const serviceSelector = document.getElementById("service");
const submitBtn = document.getElementById("book-app-btn");

const fileInput = document.getElementById("hair-image");
const fileDrop = document.getElementById("file-drop");
const hairImageLabel = document.querySelector(".hair-image-label");
const hairImageHelp = document.getElementById("hair-image-help");
const thumbs = document.getElementById("hair-image-thumbs");
const note = document.getElementById("hair-image-note");

// Source of truth. The input's own FileList is rebuilt from this.
let selectedFiles = [];

// Object URLs currently handed to <img> elements, revoked on every re-render so
// large phone photos don't accumulate in memory.
let thumbUrls = [];

// Remembered so the message can be re-rendered when the language changes.
let noteKey = "";

function imageIsRequired() {
    return IMAGE_REQUIRED_SERVICES.has(serviceSelector.value);
}

// Trust the MIME type when the picker provides one, otherwise fall back to the
// extension. The extension check is case-insensitive because some pickers (notably iOS) hand over uppercase.
function isAllowedType(file) {
    if (file.type) return ALLOWED_TYPES.includes(file.type);
    return ALLOWED_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext));
}

function showNote(key) {
    noteKey = key || "";
    if (!noteKey) {
        note.hidden = true;
        note.textContent = "";
        return;
    }
    note.textContent = t(noteKey);
    note.hidden = false;
}

function renderThumbs() {
    // Detach the old nodes BEFORE revoking their URLs: revoking a URL that a
    // still-attached <img> is mid-decode on would fire a spurious error event.
    thumbs.innerHTML = "";
    thumbUrls.forEach(URL.revokeObjectURL);
    thumbUrls = [];

    selectedFiles.forEach((file) => {
        const item = document.createElement("div");
        item.className = "file-drop-item";

        const img = document.createElement("img");
        img.className = "file-drop-thumb";
        img.alt = file.name;

        // Object URLs stream from disk instead of loading the whole photo into a
        // base64 string the way FileReader does; much lighter for phone photos.
        const url = URL.createObjectURL(file);
        thumbUrls.push(url);
        img.src = url;

        // A file can pass the type check and still be undecodable; an iPhone HEIC
        // arriving through the Files app is the usual case. The only reliable test
        // is asking the browser to render it, so a decode failure drops the file.
        img.addEventListener("error", () => {
            if (!img.isConnected) return;   // stale node from an earlier render
            rejectUndecodable(file);
        });

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "file-drop-clear";
        remove.textContent = "×";
        // The multiplication sign alone is not an accessible name.
        remove.setAttribute("aria-label", `${t("form.hair-img.remove")}: ${file.name}`);
        remove.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            removeFile(file);
        });

        item.append(img, remove);
        thumbs.appendChild(item);
    });
}

// Removal is by identity, not index: an index captured at render time goes stale
// as soon as an earlier item is removed.
function removeFile(file) {
    selectedFiles = selectedFiles.filter(f => f !== file);
    showNote("");
    syncInput();
}

function rejectUndecodable(file) {
    if (!selectedFiles.includes(file)) return;   // already removed
    selectedFiles = selectedFiles.filter(f => f !== file);
    showNote("form.error.imageUnreadable");
    syncInput();
}

function syncInput() {
    // Rebuild the input's FileList from our array so the two never disagree.
    const dt = new DataTransfer();
    selectedFiles.forEach(f => dt.items.add(f));
    fileInput.files = dt.files;

    // The stylesheet hides the prompt at three files via .is-full. The old code
    // set .has-file, which no CSS rule reads.
    fileDrop.classList.toggle("is-full", selectedFiles.length >= MAX_IMAGES);

    renderThumbs();
}

// Merges rather than replaces, so a second pick adds to the first.
function addFiles(incoming) {
    let message = null;
    let droppedForLimit = false;

    for (const file of incoming) {
        if (selectedFiles.length >= MAX_IMAGES) { droppedForLimit = true; continue; }
        if (!isAllowedType(file)) { message = "form.error.imageType"; continue; }
        if (file.size > MAX_FILE_BYTES) { message = "form.error.imageTooLarge"; continue; }
        // Same photo picked twice across two visits to the picker.
        if (selectedFiles.some(f => f.name === file.name && f.size === file.size)) continue;
        selectedFiles.push(file);
    }

    // HTML has no "maximum number of files" attribute, so the OS picker hands over
    // as many as the user taps. Extras are dropped here — and said out loud,
    // because silently discarding their photos is the confusing part.
    if (droppedForLimit) message = "form.hair-img.limit";

    showNote(message);
    syncInput();
}

function updateHairImageRequirement() {
    const needsImage = imageIsRequired();
    // Asterisk and help line appear together, only once a service that needs a
    // photo is chosen.
    hairImageLabel.classList.toggle("is-required", needsImage);
    hairImageHelp.hidden = !needsImage;
}

fileInput.addEventListener("change", () => {
    // Snapshot before syncInput reassigns fileInput.files
    addFiles(Array.from(fileInput.files));
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
    if (e.dataTransfer.files?.length) addFiles(Array.from(e.dataTransfer.files));
});

document.getElementById("appointment-form").addEventListener("reset", () => {
    selectedFiles = [];
    showNote("");
    syncInput();
    updateHairImageRequirement();
});

serviceSelector.addEventListener("change", () => {
    updateHairImageRequirement();
    // A "photo required" warning is stale once the service changes.
    if (noteKey === "form.error.imageRequired") showNote("");
});

// language.js fires this after swapping the active bundle. Text this file creates
// isn't covered by its [data-i18n] sweep, so it is refreshed here.
document.addEventListener("languagechange", () => {
    if (noteKey) note.textContent = t(noteKey);
    thumbs.querySelectorAll(".file-drop-clear").forEach((btn, i) => {
        const file = selectedFiles[i];
        if (file) btn.setAttribute("aria-label", `${t("form.hair-img.remove")}: ${file.name}`);
    });
});

// One in-flight submission at a time. The flag guards against repeated Enter presses,
// which fire before the button's disabled state is painted.
let submitting = false;

async function uploadHairImages() {
    // selectedFiles is the source of truth; the input's FileList mirrors it.
    if (selectedFiles.length === 0) {
        return { imageUrls: [], imagePublicIds: [] };
    }

    // Count, type and size are already enforced in addFiles(), which is the only
    // way a file can reach selectedFiles — so there is one place to change a rule.
    const fd = new FormData();
    selectedFiles.forEach(file => fd.append("files", file));

    // No Content-Type header: the browser must set it so the multipart boundary
    // is generated. Setting it by hand is what breaks multipart uploads.
    const res = await fetch(`${API_BASE_URL}/api/v1/uploads`, {
        method: "POST",
        body: fd
    });

    if (!res.ok) throw new ApiError("form.error.upload");

    const uploaded = await res.json();

    return {
        imageUrls: uploaded.map(img => img.url),
        imagePublicIds: uploaded.map(img => img.publicId)
    };
}

// Carries a translation key rather than a technical string
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

    // Replaces the `required` attribute that used to sit on the file input.
    // Native validation runs before this handler, so a native block would prevent
    // this code from ever executing — and would point its bubble at an element
    // that is 1px wide on desktop. Here the message lands in the visible line.
    if (imageIsRequired() && selectedFiles.length === 0) {
        showNote("form.error.imageRequired");
        document.querySelector(".img-container").scrollIntoView({
            behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center"
        });
        return;
    }

    // Lock the button synchronously, before any await — this is the whole point.
    submitting = true;
    setSubmitting(true);

    try {
        const {imageUrls, imagePublicIds} = await uploadHairImages();
        console.log("imageUrls", imageUrls);
        console.log("imagePublicIds", imagePublicIds);

        const payload = {
            name: document.getElementById("customer-name").value,
            phoneNumber: phoneDigits,
            serviceType: document.getElementById("service").value,
            date: dateInput.value,
            startTime: timeInput.value,
            smsConsent: document.getElementById("consent-sms").checked,
            additionalNotes: document.getElementById("notes").value.trim() || null,
            hairImageUrls: imageUrls,
            hairImagePublicIds: imagePublicIds,
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