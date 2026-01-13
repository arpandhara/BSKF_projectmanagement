import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, X } from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

const ToastItem = ({ id, message, link, onRemove }) => {
  const itemRef = useRef(null);
  const navigate = useNavigate();

  useGSAP(() => {
    gsap.fromTo(itemRef.current,
      { x: 100, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.4, ease: "back.out(1.2)" }
    );
  }, { scope: itemRef });

  // Exit Animation Handler
  const animateOut = () => {
    gsap.to(itemRef.current, {
      x: 100,
      opacity: 0,
      duration: 0.3,
      ease: "power2.in",
      onComplete: () => onRemove(id) 
    });
  };

  // Auto-dismiss timer
  useEffect(() => {
    const timer = setTimeout(() => {
      animateOut();
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  const handleClick = () => {
    if (link) navigate(link);
    animateOut();
  };

  return (
    <div
      ref={itemRef}
      onClick={handleClick}
      className="bg-neutral-900 border border-neutral-800 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-4 cursor-pointer hover:bg-neutral-800 transition-colors w-80"
    >
      <div className="bg-blue-600/20 p-2 rounded-full text-blue-500">
        <Bell size={20} />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium line-clamp-2">{message}</p>
        <p className="text-xs text-neutral-500 mt-1">Click to view</p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          animateOut();
        }}
        className="text-neutral-500 hover:text-white"
      >
        <X size={16} />
      </button>
    </div>
  );
};

const ToastContainer = () => {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handleShowToast = (event) => {
      const { message, link } = event.detail;
      const id = Date.now();
      // Add new toast to the list
      setToasts((prev) => [...prev, { id, message, link }]);
    };

    window.addEventListener("show-toast", handleShowToast);
    return () => window.removeEventListener("show-toast", handleShowToast);
  }, []);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-3">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          {...toast}
          onRemove={removeToast}
        />
      ))}
    </div>
  );
};

export default ToastContainer;