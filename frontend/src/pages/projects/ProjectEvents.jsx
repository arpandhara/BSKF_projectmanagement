import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Video, Calendar, Plus, ExternalLink, Clock } from "lucide-react";
import Modal from "../../components/common/Modal";
import api from "../../services/api";
import { getSocket } from "../../services/socket";
import { useAuth, useUser } from "@clerk/clerk-react"; // Import Auth

const ProjectEvents = () => {
  const { id } = useParams();
  const { orgRole } = useAuth();
  const { user } = useUser();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ title: "", startDate: "", meetLink: "" });

  // Admin Check
  const isAdmin = user?.publicMetadata?.role === "admin" || orgRole === "org:admin";

  const fetchEvents = async () => {
    try {
      const res = await api.get(`/projects/${id}/events`);
      setEvents(res.data);
    } catch (error) {
      console.error("Failed to load events");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    const socket = getSocket();
    if (socket) {
      const handleNewEvent = (newEvent) => {
        setEvents((prev) => [...prev, newEvent].sort((a, b) => new Date(a.startDate) - new Date(b.startDate)));
      };
      socket.on("event:created", handleNewEvent);
      return () => socket.off("event:created", handleNewEvent);
    }
  }, [id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/projects/${id}/events`, { ...formData, startDate: new Date(formData.startDate) });
      setIsModalOpen(false);
      setFormData({ title: "", startDate: "", meetLink: "" });
    } catch (error) {
      alert("Failed to create event. Ensure you are an admin.");
    }
  };

  if (loading) return <div className="text-neutral-500 p-4">Loading events...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-white">Upcoming Meetings</h3>
        {isAdmin && (
          <button onClick={() => setIsModalOpen(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2">
            <Plus size={16} /> Schedule
          </button>
        )}
      </div>

      <div className="grid gap-4">
        {events.map((event) => (
            <div key={event._id} className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="bg-purple-500/10 p-3 rounded-lg text-purple-400"><Video size={24} /></div>
                <div>
                  <h4 className="font-bold text-white">{event.title}</h4>
                  <div className="flex items-center gap-4 mt-1 text-sm text-neutral-400">
                    <span className="flex items-center gap-1.5"><Calendar size={14} />{new Date(event.startDate).toLocaleDateString()}</span>
                    <span className="flex items-center gap-1.5"><Clock size={14} />{new Date(event.startDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              </div>
              {event.meetLink && (
                <a href={event.meetLink} target="_blank" rel="noreferrer" className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg text-sm font-medium border border-neutral-700 flex items-center gap-2">
                  Join <ExternalLink size={14} />
                </a>
              )}
            </div>
        ))}
        {events.length === 0 && <div className="text-center py-10 border border-dashed border-neutral-800 rounded-xl text-neutral-500">No upcoming meetings.</div>}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Schedule Meeting">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1"><label className="text-sm font-medium text-neutral-300">Title</label><input required type="text" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white" /></div>
          <div className="space-y-1"><label className="text-sm font-medium text-neutral-300">Date</label><input required type="datetime-local" value={formData.startDate} onChange={(e) => setFormData({...formData, startDate: e.target.value})} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white [&::-webkit-calendar-picker-indicator]:invert" /></div>
          <div className="space-y-1"><label className="text-sm font-medium text-neutral-300">Link</label><input type="url" placeholder="https://meet.google.com/..." value={formData.meetLink} onChange={(e) => setFormData({...formData, meetLink: e.target.value})} className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white" /></div>
          <div className="flex justify-end pt-4"><button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">Schedule</button></div>
        </form>
      </Modal>
    </div>
  );
};

export default ProjectEvents;