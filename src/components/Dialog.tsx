import type {ReactNode} from 'react';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** A centered modal: Escape or a click on the backdrop closes it, and keys never reach the timeline. */
export function Dialog({title, onClose, children}: DialogProps) {
  return (
    <div
      className="dialog-backdrop"
      onClick={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={event => {
          if (event.key === 'Escape') onClose();
          event.stopPropagation();
        }}
      >
        <div className="dialog-head">
          <h2>{title}</h2>
          <button type="button" className="round" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
