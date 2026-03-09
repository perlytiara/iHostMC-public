interface AppLogoProps {
  className?: string;
  size?: number;
}

/** iHostMC app icon: server block with "iH" mark. Used in title bar, tray, and home. */
export function AppLogo({ className = "", size = 48 }: AppLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="logo-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7c6bff" />
          <stop offset="100%" stopColor="#5344dd" />
        </linearGradient>
        <linearGradient id="logo-face" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#8b7dff" />
          <stop offset="100%" stopColor="#634bff" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="6" fill="url(#logo-bg)" />
      {/* Centered, tasteful "iH" – thinner stroke, scaled up and centered */}
      <g transform="translate(16, 15.35) scale(1.28) translate(-13.25, -14.75)">
        <circle cx="11" cy="10" r="2.25" fill="white" />
        <path
          d="M11 14v8 M14 14v5 M14 17h4 M18 14v8"
          stroke="white"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
    </svg>
  );
}
