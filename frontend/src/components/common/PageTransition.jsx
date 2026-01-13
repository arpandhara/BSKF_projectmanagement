import React, { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

const PageTransition = ({ children, className = "" }) => {
  const container = useRef(null);

  useGSAP(() => {
    // 1. Set initial state (invisible and slightly lower)
    // 2. Animate to opacity 1 and y 0
    gsap.fromTo(container.current, 
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }
    );
  }, { scope: container });

  return (
    <div ref={container} className={`w-full h-full ${className}`}>
      {children}
    </div>
  );
};

export default PageTransition;