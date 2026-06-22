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
// cosnt

document.getElementById("appointment-form").addEventListener("submit", async (e) => {
    e.preventDefault(); //preventing empty form from submitting
    console.log("something");

    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);

    console.log(formData);
    console.log(data);

    let test = true;

// later add the api call 

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
    // maxDate: new Date().fp_incr(14),
    disableMobile: true,      // forces Flatpickr UI even on iOS/Android
    allowInput: false,        // no manual typing
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
            instance.set("maxTime", "18:30");
        }
    }
});