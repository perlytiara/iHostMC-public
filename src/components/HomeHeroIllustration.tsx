interface HomeHeroIllustrationProps {
  className?: string;
  size?: number;
}

/** Hero SVG: server stack / hosting illustration for the home page. */
export function HomeHeroIllustration({ className = "", size = 160 }: HomeHeroIllustrationProps) {
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
      {/* Glow behind */}
      <ellipse cx="80" cy="100" rx="55" ry="18" fill="url(#hero-glow)" />
      {/* Server stack: 3 blocks */}
      <g fill="url(#hero-server)" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5">
        <rect x="45" y="52" width="70" height="22" rx="4" />
        <rect x="50" y="28" width="60" height="22" rx="4" />
        <rect x="55" y="4" width="50" height="22" rx="4" />
      </g>
      {/* LED strips */}
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
