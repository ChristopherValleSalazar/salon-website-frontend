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

document.getElementById("appointment-form").addEventListener("submit", async (e) => {
    e.preventDefault(); //preventing empty form from submitting

    const dateInput = document.getElementById("date-input");
    const visibleInput = dateInput._flatpickr.altInput;

    if (!dateInput.value) {
        visibleInput.classList.add("input-error");
        visibleInput.scrollIntoView({behavior: "smooth", block: "center" });
        return;
    }
    visibleInput.classList.remove("input-error");

    try {
        let imageUrl = null;
        let imagePublicId = null;

        const sig = await fetch(`${API_BASE_URL}/api/v1/uploads/signature`).then(r => r.json());

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
        if(!res.ok) throw new Error('image upload failed');
        const data = await res.json();
        imageUrl = data.secure_url;
        imagePublicId = data.public_id;

        const [date, time] = dateInput.value.split(" ");

        const payload = {
            name: document.getElementById("customer-name").value,
            phoneNumber: document.getElementById("client-phone").value,
            serviceType: document.getElementById("service").value,
            date: date,
            startTime: time,
            smsConsent: document.getElementById("consent-sms").checked,
            additionalNotes: document.getElementById("notes").value.trim() || null,
            hairImageUrl: imageUrl,
            hairImagePublicId: imagePublicId
        };

        console.log(payload);

        const submitBtn = document.getElementById("book-app-btn");
        submitBtn.disabled = true;

        console.log("Submitting appointment:", payload);

        const resPost = await fetch((`${API_BASE_URL}/api/v1/appointments`), {
            method: "POST",
            headers: { "content-type": "application/json"},
            body: JSON.stringify(payload)
        });

        if(resPost.ok) {
            const body = await resPost.json();
            modalBehaviour(body); // implement body in modalBehaviour to show the success message
        } else {
            const body = await resPost.json().catch(() => ({}));
            failureModalBehaviour(body.error || "An error occurred while submitting the appointment."); // message from the response body
        }
    } catch (err) {
        failureModalBehaviour(err.message);
    } finally {
        submitBtn.disabled = false
    }
});

const modalOverlay = document.querySelector(".modal-overlay");

// SUCCESS MODAL
function modalBehaviour() {
    const modalOverlay = document.getElementById("success-modal-overlay");
    const closeBtn = document.getElementById("modal-btn-close");

    modalOverlay.classList.add("is-open");

    closeBtn.addEventListener("click", () => {
        document.getElementById("appointment-form").reset();
        modalOverlay.classList.remove("is-open");
    });
}

// FAILURE MODAL (prototype)
// `message` will come from the backend response body once the booking request
// is wired up; when it's empty we fall back to the placeholder text already in
// the markup.
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
    minDate: "today",
    allowInput: false,
    enableTime: true,
    altInput: true,
    dateFormat: "Y-m-d H:i",
    altFormat: "F j, Y h:i K",
    defaultHour: 10,
    minTime: "10:00",
    maxTime: "18:30",

    disable: [
        date => date.getDay() === 1
    ],

    onChange(selectedDates, dateStr, instance) {
        const day = selectedDates[0].getDay();

        if(day === 0) {
            instance.set("maxTime", "15:00");
        } else {
            instance.set("maxTime", "18:30"); // Last booking slot, not closing time — allows buffer for longer services
        }

        if (dateStr) {
            instance.altInput.classList.remove("input-error");
        }
    }
});