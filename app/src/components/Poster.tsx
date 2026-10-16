import { useState, type CSSProperties, type ReactNode } from 'react';
import { placeholderColor, tmdbImg } from '../merge';

interface Props {
  title: string;
  path?: string;
  size?: 'w185' | 'w342' | 'w780';
  className?: string;
  style?: CSSProperties;
  /** Show the title on the placeholder (grid and hero do; small thumbs don't). */
  label?: boolean;
  lightness?: number;
  children?: ReactNode;
}

/** TMDB poster, or a tile coloured from the title hash when there's no image. */
export function Poster({ title, path, size = 'w342', className = 'poster', style, label = true, lightness, children }: Props) {
  const [failed, setFailed] = useState(false);
  const src = failed ? undefined : tmdbImg(path, size);
  return (
    <div
      className={`${className}${src ? '' : ' ph'}`}
      style={{ position: 'relative', overflow: 'hidden', backgroundColor: placeholderColor(title, lightness), ...style }}
    >
      {src ? (
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        label && <div className="ph-title">{title}</div>
      )}
      {children}
    </div>
  );
}
