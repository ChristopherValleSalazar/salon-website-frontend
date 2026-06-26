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

const modalOverlay = document.querySelector(".modal-overlay");

console.log(modalOverlay.classList)

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

    onChange(selectedDates, datestr, instance) {
        const day = selectedDates[0].getDay();

        if(day === 0) {
            instance.set("maxTime", "15:00");
        } else {
            instance.set("maxTime", "19:00"); // Last booking slot, not closing time — allows buffer for longer services
        }

        if (dateStr) {
        instance.altInput.classList.remove("input-error");
    }
    }
});