import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { 
  Video, 
  Calendar as CalendarIcon, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  ExternalLink,
  Trash2
} from "lucide-react";
import Modal from "../../components/common/Modal";
import api from "../../services/api";
import { getSocket } from "../../services/socket";
import { useAuth } from "@clerk/clerk-react";

const ProjectEvents = () => {
  const { id } = useParams();
  const { orgRole } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [formData, setFormData] = useState({ title: "", startDate: "", meetLink: "" });

  const isAdmin = orgRole === "org:admin";

  const fetchEvents = async () => {
    try {
      const res = await api.get(`/projects/${id}/events`);
      setEvents(res.data);
    } catch {
      console.error("Failed to fetch events");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    const socket = getSocket();
    if (socket) {
      const handleNewEvent = (newEvent) => {
        setEvents((prev) => [...prev, newEvent]);
      };
      const handleEventDeleted = (deletedEventId) => {
        setEvents((prev) => prev.filter(e => e._id !== deletedEventId));
      };

      socket.on("event:created", handleNewEvent);
      socket.on("event:deleted", handleEventDeleted);
      
      return () => {
        socket.off("event:created", handleNewEvent);
        socket.off("event:deleted", handleEventDeleted);
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Calendar Logic
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    
    const days = [];
    // Padding for previous month
    for (let i = 0; i < firstDayOfMonth; i++) {
        days.push(null);
    }
    // Days of current month
    for (let i = 1; i <= daysInMonth; i++) {
        days.push(new Date(year, month, i));
    }
    return days;
  };

  const days = getDaysInMonth(currentDate);
  const weeks = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };
  
  const isSameDay = (d1, d2) => {
      if (!d1 || !d2) return false;
      return d1.getDate() === d2.getDate() && 
             d1.getMonth() === d2.getMonth() && 
             d1.getFullYear() === d2.getFullYear();
  };

  const isToday = (date) => isSameDay(date, new Date());

  const getEventsForDay = (date) => {
      if (!date) return [];
      return events.filter(e => isSameDay(new Date(e.startDate), date));
  };

  const selectedDayEvents = getEventsForDay(selectedDate);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/projects/${id}/events`, { 
          ...formData, 
          startDate: new Date(formData.startDate) 
      });
      setIsModalOpen(false);
      setFormData({ title: "", startDate: "", meetLink: "" });
    } catch {
      alert("Failed to create event");
    }
  };

  const handleDeleteEvent = async (eventId) => {
      if(!window.confirm("Are you sure you want to delete this meeting?")) return;
      try {
          await api.delete(`/projects/${id}/events/${eventId}`);
          // Socket will handle the UI update
      } catch (error) {
          console.error("Failed to delete event", error);
          alert("Failed to delete event");
      }
  };

  // Preset date in form when opening modal
  const openScheduleModal = () => {
      const now = new Date();
      // If selected date is in future, use it, else use now
      const initialDate = selectedDate > now ? selectedDate : now;
      // Format for datetime-local: YYYY-MM-DDTHH:MM
      const offset = initialDate.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(initialDate - offset)).toISOString().slice(0, 16);
      
      setFormData({ ...formData, startDate: localISOTime });
      setIsModalOpen(true);
  }

  if (loading) return <div className="p-8 text-center text-neutral-500 animate-pulse">Loading calendar...</div>;

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6 h-auto lg:h-[600px]">
        {/* Calendar Column */}
        <div className="lg:col-span-2 flex flex-col h-auto lg:h-full bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-sm order-2 lg:order-1">
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm">
                <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-white">
                        {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </h2>
                    <p className="text-neutral-400 text-xs sm:text-sm">Organize your team meetings and deadlines</p>
                </div>
                <div className="flex items-center gap-2 bg-neutral-800 p-1 rounded-lg border border-neutral-700">
                    <button onClick={prevMonth} className="p-1.5 sm:p-2 hover:bg-neutral-700 rounded-md text-neutral-300 hover:text-white transition-colors">
                        <ChevronLeft size={18} />
                    </button>
                    <button onClick={() => setCurrentDate(new Date())} className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium hover:bg-neutral-700 rounded-md text-neutral-300 hover:text-white transition-colors">
                        Today
                    </button>
                    <button onClick={nextMonth} className="p-1.5 sm:p-2 hover:bg-neutral-700 rounded-md text-neutral-300 hover:text-white transition-colors">
                        <ChevronRight size={18} />
                    </button>
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 p-3 sm:p-6">
                <div className="grid grid-cols-7 mb-2 sm:mb-4">
                    {weeks.map(day => (
                        <div key={day} className="text-center text-xs sm:text-sm font-medium text-neutral-500 uppercase tracking-wider py-2">
                            {day}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7 auto-rows-[minmax(50px,1fr)] lg:grid-rows-6 gap-1 sm:gap-2 h-auto lg:h-full">
                    {days.map((day, idx) => {
                        const dayEvents = getEventsForDay(day);
                        const isSelected = isSameDay(day, selectedDate);
                        const isCurrentDay = isToday(day);

                        return (
                            <div 
                                key={idx}
                                onClick={() => day && setSelectedDate(day)}
                                className={`
                                    relative flex flex-col items-center justify-start py-2 px-1 rounded-xl border transition-all duration-200 cursor-pointer group
                                    ${!day ? 'invisible' : 'visible'}
                                    ${isSelected 
                                        ? 'bg-blue-600/10 border-blue-600/50 ring-1 ring-blue-600/50 z-10' 
                                        : 'bg-neutral-900/50 border-transparent hover:bg-neutral-800 hover:border-neutral-700'}
                                    ${isCurrentDay && !isSelected ? 'bg-neutral-800 border-neutral-700' : ''}
                                `}
                            >
                                <span className={`
                                    w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium mb-1
                                    ${isCurrentDay ? 'bg-blue-600 text-white' : 'text-neutral-400 group-hover:text-white'}
                                `}>
                                    {day?.getDate()}
                                </span>
                                
                                {/* Event Indicators (Dots) */}
                                <div className="flex gap-1 flex-wrap justify-center px-2 w-full">
                                    {dayEvents.slice(0, 4).map((_, i) => (
                                        <div key={i} className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_5px_rgba(168,85,247,0.5)]"></div>
                                    ))}
                                    {dayEvents.length > 4 && (
                                        <span className="text-[10px] text-neutral-500 leading-none">+</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>

        {/* Sidebar: Selected Date Details */}
        <div className="flex flex-col gap-6 h-auto lg:h-full order-1 lg:order-2">
            {/* Action Card */}
            {isAdmin && (
                <div className="p-5 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl shadow-lg border border-blue-500/20 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
                    <div className="relative z-10">
                        <h3 className="text-lg font-bold text-white mb-2">Schedule Meeting</h3>
                        <p className="text-blue-100 text-sm mb-4 line-clamp-2">Plan a video call or detailed discussion with your team for {selectedDate.toLocaleDateString()}.</p>
                        <button 
                            onClick={openScheduleModal}
                            className="bg-white text-blue-600 hover:bg-blue-50 px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-md active:scale-95"
                        >
                            <Plus size={18} /> Add Event
                        </button>
                    </div>
                </div>
            )}

            {/* Events List for Selected Day */}
            <div className="flex-1 bg-neutral-900 border border-neutral-800 rounded-2xl p-5 overflow-hidden flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <Clock className="text-neutral-400" size={18}/>
                        Events on {selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </h3>
                    <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-1 rounded-md">
                        {selectedDayEvents.length}
                    </span>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
                    {selectedDayEvents.length > 0 ? (
                        selectedDayEvents.map((event) => (
                            <div key={event._id} className="group bg-neutral-950 p-4 rounded-xl border border-neutral-800 hover:border-neutral-700 transition-all hover:bg-neutral-800/50">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="p-2 bg-neutral-800 rounded-lg text-purple-400 group-hover:bg-purple-500/20 group-hover:text-purple-300 transition-colors">
                                       <Video size={18} />
                                    </div>
                                    {isAdmin && (
                                        <button 
                                            onClick={() => handleDeleteEvent(event._id)}
                                            className="text-neutral-600 hover:text-red-500 transition-colors p-1"
                                            title="Delete Meeting"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                                <h4 className="font-bold text-white mb-1 group-hover:text-blue-400 transition-colors">{event.title}</h4>
                                <p className="text-xs text-neutral-400 mb-3 flex items-center gap-2">
                                    <Clock size={12} />
                                    {new Date(event.startDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                                
                                {event.meetLink && (
                                    <a 
                                        href={event.meetLink} 
                                        target="_blank" 
                                        rel="noreferrer" 
                                        className="inline-flex items-center gap-2 text-xs bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1.5 rounded-lg transition-colors border border-neutral-700"
                                    >
                                        Join Meeting <ExternalLink size={12} />
                                    </a>
                                )}
                            </div>
                        ))
                    ) : (
                       <div className="h-full flex flex-col items-center justify-center text-neutral-500 space-y-3 opacity-60">
                           <CalendarIcon size={48} strokeWidth={1} />
                           <p className="text-sm">No events for this day</p>
                       </div>
                    )}
                </div>
            </div>
        </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Schedule Meeting">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
              <label className="text-sm font-medium text-neutral-300">Title</label>
              <input 
                  required 
                  type="text" 
                  value={formData.title} 
                  onChange={(e) => setFormData({...formData, title: e.target.value})} 
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white outline-none focus:border-blue-600 transition-colors"
                  placeholder="e.g. Weekly Standup"
              />
          </div>
          <div className="space-y-1">
              <label className="text-sm font-medium text-neutral-300">Date & Time</label>
              <input 
                  required 
                  type="datetime-local" 
                  value={formData.startDate} 
                  onChange={(e) => setFormData({...formData, startDate: e.target.value})} 
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white outline-none focus:border-blue-600 transition-colors [&::-webkit-calendar-picker-indicator]:invert" 
              />
          </div>
          <div className="space-y-1">
              <label className="text-sm font-medium text-neutral-300">Meeting Link</label>
              <input 
                  type="url" 
                  placeholder="https://meet.google.com/..." 
                  value={formData.meetLink} 
                  onChange={(e) => setFormData({...formData, meetLink: e.target.value})} 
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white outline-none focus:border-blue-600 transition-colors" 
              />
          </div>
          <div className="flex justify-end pt-4 gap-2">
            <button 
                type="button" 
                onClick={() => setIsModalOpen(false)} 
                className="px-4 py-2 rounded-lg text-sm font-medium text-neutral-400 hover:text-white transition-colors"
            >
                Cancel
            </button>
            <button 
                type="submit" 
                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg text-sm font-medium transition-all shadow-lg shadow-blue-900/20"
            >
                Schedule Event
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ProjectEvents;