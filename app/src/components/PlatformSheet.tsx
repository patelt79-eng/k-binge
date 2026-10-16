import { useEffect } from 'react';
import { PROVIDERS, PROVIDER_IDS } from '../merge';
import type { ProviderId } from '../types';

interface Props {
  selected: ProviderId[];
  onToggle: (id: ProviderId) => void;
  onClose: () => void;
}

export function PlatformSheet({ selected, onToggle, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="sheet-back" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Where do you watch it?">
        <div className="grabber" />
        <div className="stack" style={{ gap: 4 }}>
          <h2>Where do you watch it?</h2>
          <div style={{ fontSize: 13.5, color: 'var(--muted)' }}>Saved for this show and kept when the data refreshes.</div>
        </div>
        <div className="pick">
          {PROVIDER_IDS.map((id) => {
            const on = selected.includes(id);
            return (
              <button key={id} className={on ? 'on' : ''} aria-pressed={on} onClick={() => onToggle(id)}>
                <span className="dot" style={{ background: PROVIDERS[id].dot }} />
                {PROVIDERS[id].label}
              </button>
            );
          })}
        </div>
        <button className="pill-acc done" onClick={onClose}>Done</button>
      </div>
    </>
  );
}
