import AppointmentReminder, { Appointment } from "./AppointmentReminder";

export default function Page() {
    const appointment: Appointment = {
        title: "Ava's Appointment Reminder",
        date: new Date("April 23, 2025"),
        time: "3:00 PM",
        // duration: "30 minutes",
        // location: "City Medical Center",
        // address: "123 Health St, Medical District",
        doctor: "Dr. Sadeghi",
        phoneNumber: "(555) 123-4567",
        notes: "Dad is now reminding you for the 700th Time!"
      }

    return (
        <div>
            <AppointmentReminder appointment={appointment} />
        </div>
    )
}

