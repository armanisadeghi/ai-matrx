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
    <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden md:max-w-lg">
      {/* Header with title */}
      <div className="bg-blue-600 px-6 py-4">
        <h2 className="text-xl font-bold text-white">{appointment.title}</h2>
      </div>
      
      {/* Main content */}
      <div className="p-6">
        {/* Date and time section */}
        <div className="mb-6 bg-blue-50 p-4 rounded-lg">
          <div className="flex items-center mb-3">
            <Calendar className="text-blue-600 mr-3" size={20} />
            <div className="text-lg font-semibold text-gray-800">{formattedDate}</div>
          </div>
          <div className="flex items-center">
            <Clock className="text-blue-600 mr-3" size={20} />
            <div className="flex flex-col">
              <span className="text-lg font-semibold text-gray-800">{appointment.time}</span>
              <span className="text-sm text-gray-600">Duration: {appointment.duration}</span>
            </div>
          </div>
        </div>
        
        {/* Location info */}
        <div className="mb-6">
          <div className="flex items-start mb-2">
            <MapPin className="text-blue-600 mr-3 mt-1 flex-shrink-0" size={20} />
            <div>
              <div className="text-lg font-semibold text-gray-800">{appointment.location}</div>
              <div className="text-gray-600">{appointment.address}</div>
            </div>
          </div>
        </div>
        
        {/* Doctor info */}
        <div className="mb-6">
          <div className="flex items-center mb-2">
            <User className="text-blue-600 mr-3" size={20} />
            <div className="text-lg font-semibold text-gray-800">{appointment.doctor}</div>
          </div>
          <div className="flex items-center">
            <Phone className="text-blue-600 mr-3" size={20} />
            <div className="text-gray-600">{appointment.phoneNumber}</div>
          </div>
        </div>
        
        {/* Notes section */}
        {appointment.notes && (
          <div className="mt-4 border-t pt-4">
            <div className="flex items-start">
              <FileText className="text-blue-600 mr-3 mt-1 flex-shrink-0" size={20} />
              <div className="text-gray-700">{appointment.notes}</div>
            </div>
          </div>
        )}
      </div>
      
      {/* Action buttons */}
      <div className="px-6 py-4 bg-gray-50 border-t flex justify-between">
        <button className="px-4 py-2 bg-white border border-gray-300 rounded text-gray-700 hover:bg-gray-100 font-medium text-sm">
          Reschedule
        </button>
        <button className="px-4 py-2 bg-blue-600 rounded text-white hover:bg-blue-700 font-medium text-sm flex items-center">
          Add to Calendar
          <ChevronRight size={16} className="ml-1" />
        </button>
      </div>
    </div>
  );
};

export default AppointmentReminder;