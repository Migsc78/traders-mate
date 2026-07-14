import { useState } from "react";
import SettingsModal from "./SettingsModal";

export default function SettingsButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Settings" title="Settings">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
            stroke="currentColor"
            strokeWidth="1.75"
          />
          <path
            d="M19.4 13a7.97 7.97 0 0 0 .1-2l2-1.5-2-3.5-2.4 1a8.1 8.1 0 0 0-1.7-1L15.5 2h-4L8.6 5.5a8.1 8.1 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.97 7.97 0 0 0 .1 2l-2 1.5 2 3.5 2.4-1a8.1 8.1 0 0 0 1.7 1L11.5 22h4l.4-3.5a8.1 8.1 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5Z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && <SettingsModal onClose={() => setOpen(false)} />}
    </>
  );
}
