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
    console.log("something");

    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);

    console.log(formData);
    console.log(data);

// later add the api call 

    if (Response.ok) {
        // confirmation windows
    } else {
        console.error("booking failed");
    }
});

flatpickr("#date-input", {
    minDate: "today",
    // maxDate: new Date().fp_incr(14),
    disableMobile: true,      // forces Flatpickr UI even on iOS/Android
    allowInput: false,        // no manual typing
    enableTime: true,
    dateFormat: "Y-m-d H:i",
    defaultDate: "2026-06-15 10:00",
    minTime: "10:00",
    maxTime: "17:00",



    
    onChange: async function(selectedDates, dateStr, fp) {
        const container = document.getElementById("time-slots-container");
        container.classList.add("visible");
        container.innerHTML = `<span class="slots-title">Loading...</span>`;
        positionSlotsPanel(fp.calendarContainer);
        await loadTimeSlots(dateStr, selectedService, container);
    },

    onOpen: function(_, __, fp) {
        positionSlotsPanel(fp.calendarContainer);
    },

    onClose: function() {
        if (!selectedTime) {
            document.getElementById("time-slots-container")
                .classList.remove("visible");
        }
    }
});
