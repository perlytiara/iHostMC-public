interface HomeHeroIllustrationProps {
  className?: string;
  size?: number;
  /** When true, draw a single prominent server block (one server). Default true. */
  single?: boolean;
}

/** Hero SVG: one server block — iconic, singular. */
export function HomeHeroIllustration({
  className = "",
  size = 160,
  single = true,
}: HomeHeroIllustrationProps) {
  if (single) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 120 120"
        width={size}
        height={size}
        className={className}
        aria-hidden
      >
        <defs>
          <linearGradient id="hero-one-server" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.95" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.7" />
          </linearGradient>
          <linearGradient id="hero-one-glow" x1="50%" y1="50%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
          <filter id="hero-one-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="8" stdDeviation="12" floodOpacity="0.25" />
          </filter>
        </defs>
        <ellipse cx="60" cy="95" rx="45" ry="14" fill="url(#hero-one-glow)" />
        <g filter="url(#hero-one-shadow)">
          <rect
            x="20"
            y="28"
            width="80"
            height="52"
            rx="8"
            fill="url(#hero-one-server)"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="2"
          />
          <circle cx="38" cy="54" r="4" fill="rgba(255,255,255,0.9)" />
          <circle cx="52" cy="54" r="4" fill="rgba(255,255,255,0.9)" />
          <circle cx="66" cy="54" r="4" fill="rgba(255,255,255,0.5)" />
          <circle cx="80" cy="54" r="4" fill="rgba(255,255,255,0.9)" />
        </g>
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 160 120"
      width={size}
      height={size * (120 / 160)}
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="hero-server" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#8b7dff" />
          <stop offset="100%" stopColor="#5344dd" />
        </linearGradient>
        <linearGradient id="hero-glow" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="100" rx="55" ry="18" fill="url(#hero-glow)" />
      <g fill="url(#hero-server)" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5">
        <rect x="45" y="52" width="70" height="22" rx="4" />
        <rect x="50" y="28" width="60" height="22" rx="4" />
        <rect x="55" y="4" width="50" height="22" rx="4" />
      </g>
      <circle cx="62" cy="63" r="2.5" fill="#00e89d" />
      <circle cx="72" cy="63" r="2.5" fill="#00e89d" />
      <circle cx="82" cy="63" r="2.5" fill="rgba(255,255,255,0.4)" />
      <circle cx="92" cy="63" r="2.5" fill="#00e89d" />
      <circle cx="67" cy="39" r="2.5" fill="#00e89d" />
      <circle cx="77" cy="39" r="2.5" fill="#00e89d" />
      <circle cx="87" cy="39" r="2.5" fill="#00e89d" />
      <circle cx="72" cy="15" r="2.5" fill="rgba(255,255,255,0.5)" />
      <circle cx="82" cy="15" r="2.5" fill="rgba(255,255,255,0.5)" />
    </svg>
  );
}
