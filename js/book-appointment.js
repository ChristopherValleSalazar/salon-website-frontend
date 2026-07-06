document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    const service = params.get("service");

    if (service) {
        const select = document.getElementById("service");

        if (select) {
            select.value = service;
        }
    }
});

document.getElementById("appointment-form").addEventListener("submit", async (e) => {
    e.preventDefault(); //preventing empty form from submitting

    const dateInput = document.getElementById("date-input");
    const visibleInput = dateInput._flatpickr.altInput;

    if (!dateInput.value) {
        visibleInput.classList.add("input-error");
        visibleInput.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
    }
    visibleInput.classList.remove("input-error");

    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);

    // Prototype: show the success modal for now. Once the backend is wired up,
    // branch on the response and pass the error text to failureModalBehaviour:
    //
    //   const res = await fetch("/api/appointments", { method: "POST", body: formData });
    //   if (res.ok) {
    //       modalBehaviour();
    //   } else {
    //       const body = await res.json().catch(() => ({}));
    //       failureModalBehaviour(body.message); // message from the response body
    //   }
    modalBehaviour();
});

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
    document.getElementById("failure-modal-btn-close").addEventListener("click", closeFailureModal);
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
