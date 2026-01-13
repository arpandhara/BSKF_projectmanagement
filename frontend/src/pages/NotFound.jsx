import React from "react";
import { useNavigate } from "react-router-dom";
import { Trees, Tent, Mountain, ArrowLeft, Home } from "lucide-react";

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4 text-center relative overflow-hidden">
      {/* Background Elements for "Grass" vibe */}
      <div className="absolute bottom-0 left-0 w-full h-1/3 bg-linear-to-t from-green-900/10 to-transparent pointer-events-none" />
      
      <div className="relative z-10 max-w-lg mx-auto animate-in fade-in zoom-in duration-500">
        {/* Illustration */}
        <div className="flex justify-center items-end gap-4 mb-8 text-green-500/80">
          <Trees size={64} strokeWidth={1.5} className="animate-bounce delay-700" style={{ animationDuration: '3s' }} />
          <Tent size={80} strokeWidth={1.5} className="text-blue-500/80" />
          <Mountain size={64} strokeWidth={1.5} className="text-neutral-600" />
        </div>

        {/* 404 Text */}
        <h1 className="text-8xl font-black text-white tracking-tighter mb-2">
          404
        </h1>
        <div className="inline-block bg-red-500/10 border border-red-500/20 rounded-full px-4 py-1 mb-6">
          <span className="text-red-400 text-sm font-bold tracking-wide uppercase">
            Page Not Found
          </span>
        </div>

        {/* Humorous Message */}
        <h2 className="text-2xl font-bold text-white mb-4">
          Where are the developers?
        </h2>
        <p className="text-neutral-400 text-lg leading-relaxed mb-8">
          We can't find the page you're looking for. To be honest, we can't find our dev team either. 
          Rumor has it they went outside to <span className="text-green-400 font-bold">"touch grass"</span> and haven't been seen since.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white transition-all font-medium"
          >
            <ArrowLeft size={18} />
            Go Back
          </button>
          
          <button 
            onClick={() => navigate("/")}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-all font-medium shadow-lg shadow-blue-900/20"
          >
            <Home size={18} />
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;