import React from "react";
import { SignIn } from "@clerk/clerk-react";

const LoginPage = () => {
  return (
    <div className="flex min-h-screen bg-neutral-950">
      {/* Left Side - Image */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <img 
          src="/src/assets/auth-bg.png" 
          alt="Login Background" 
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/20" /> {/* Overlay for better contrast if needed */}
        <div className="absolute bottom-10 left-10 z-10">
           <h2 className="text-4xl font-bold text-white mb-2">Cloud Ops Hub</h2>
           <p className="text-neutral-200 text-lg">Manage your projects efficiently.</p>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-8 bg-neutral-950">
        <div className="w-full max-w-md">

          <SignIn 
            routing="path" 
            path="/login" 
            signUpUrl="/sign-up"
            appearance={{
              variables: {
                colorPrimary: '#2563eb',
                colorBackground: '#171717',
                colorText: 'white',
                colorInputBackground: '#0a0a0a',
                colorInputText: 'white',
                colorTextSecondary: '#a3a3a3',
              },
              elements: {
                card: 'bg-neutral-900 border border-neutral-800 shadow-xl w-full',
                headerTitle: 'text-white',
                headerSubtitle: 'text-neutral-400',
                socialButtonsBlockButton: '!bg-white !text-neutral-950 hover:!bg-neutral-200 !border-neutral-200',
                formButtonPrimary: 'bg-blue-600 hover:bg-blue-500 normal-case',
                footerActionLink: 'text-blue-400 hover:text-blue-300'
              }
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default LoginPage;