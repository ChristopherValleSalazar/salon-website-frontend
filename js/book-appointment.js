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

const modalOverlay = document.querySelector(".modal-overlay");

// console.log(modalOverlay.classList)

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

    modalBehaviour();

    // if (Response.ok) {
        
    //     // document.getElementById("appointment-form").reset()
    // } else {
    //     console.error("booking failed");
    // }
});

function modalBehaviour() {
    const modalOverlay = document.querySelector(".modal-overlay");
    const closeBtn = document.querySelector(".secondary-btn");

    modalOverlay.classList.add("is-open");
    
    closeBtn.addEventListener("click", () =>  {
        document.getElementById("appointment-form").reset();
        modalOverlay.classList.remove("is-open");
        
    })
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