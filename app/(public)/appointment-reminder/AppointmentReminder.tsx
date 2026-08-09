import React from 'react';
import { Calendar, Clock, MapPin, User, Phone, FileText, ChevronRight } from 'lucide-react';


export type Appointment = {
    title?: string;
    date?: Date;
    time?: string;
    duration?: string;
    location?: string;
    address?: string;
    doctor?: string;
    phoneNumber?: string;
    notes?: string;
}

// This component accepts appointment details as a prop
const AppointmentReminder = ({ appointment }: { appointment: Appointment }) => {

  const formattedDate = appointment.date instanceof Date 
    ? appointment.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : appointment.date;

  return (
    <div className="max-w-md mx-auto bg-card rounded-xl shadow-md overflow-hidden md:max-w-lg">
      {/* Header with title */}
      <div className="bg-primary px-6 py-4">
        <h2 className="text-xl font-bold text-primary-foreground">{appointment.title}</h2>
      </div>
      
      {/* Main content */}
      <div className="p-6">
        {/* Date and time section */}
        <div className="mb-6 bg-primary/10 p-4 rounded-lg">
          <div className="flex items-center mb-3">
            <Calendar className="text-primary mr-3" size={20} />
            <div className="text-lg font-semibold text-foreground">{formattedDate}</div>
          </div>
          <div className="flex items-center">
            <Clock className="text-primary mr-3" size={20} />
            <div className="flex flex-col">
              <span className="text-lg font-semibold text-foreground">{appointment.time}</span>
              <span className="text-sm text-muted-foreground">Duration: {appointment.duration}</span>
            </div>
          </div>
        </div>
        
        {/* Location info */}
        <div className="mb-6">
          <div className="flex items-start mb-2">
            <MapPin className="text-primary mr-3 mt-1 flex-shrink-0" size={20} />
            <div>
              <div className="text-lg font-semibold text-foreground">{appointment.location}</div>
              <div className="text-muted-foreground">{appointment.address}</div>
            </div>
          </div>
        </div>
        
        {/* Doctor info */}
        <div className="mb-6">
          <div className="flex items-center mb-2">
            <User className="text-primary mr-3" size={20} />
            <div className="text-lg font-semibold text-foreground">{appointment.doctor}</div>
          </div>
          <div className="flex items-center">
            <Phone className="text-primary mr-3" size={20} />
            <div className="text-muted-foreground">{appointment.phoneNumber}</div>
          </div>
        </div>
        
        {/* Notes section */}
        {appointment.notes && (
          <div className="mt-4 border-t border-border pt-4">
            <div className="flex items-start">
              <FileText className="text-primary mr-3 mt-1 flex-shrink-0" size={20} />
              <div className="text-muted-foreground">{appointment.notes}</div>
            </div>
          </div>
        )}
      </div>
      
      {/* Action buttons */}
      <div className="px-6 py-4 bg-muted/50 border-t border-border flex justify-between">
        <button className="px-4 py-2 bg-card border border-border rounded text-muted-foreground hover:bg-accent font-medium text-sm">
          Reschedule
        </button>
        <button className="px-4 py-2 bg-primary rounded text-primary-foreground hover:bg-primary/90 font-medium text-sm flex items-center">
          Add to Calendar
          <ChevronRight size={16} className="ml-1" />
        </button>
      </div>
    </div>
  );
};

export default AppointmentReminder;