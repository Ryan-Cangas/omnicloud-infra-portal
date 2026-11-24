import React from "react";

const ScrewIcon: React.FC<{ className: string }> = ({ className }) => (
  <svg
    className={`rack-screw ${className}`}
    viewBox="0 0 12 12"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1" />
    <line x1="3" y1="6" x2="9" y2="6" stroke="currentColor" strokeWidth="1" />
  </svg>
);

export const CornerScrews: React.FC = () => (
  <>
    <ScrewIcon className="rack-screw-tl" />
    <ScrewIcon className="rack-screw-tr" />
    <ScrewIcon className="rack-screw-bl" />
    <ScrewIcon className="rack-screw-br" />
  </>
);
