/** iHostMC app icon: same as desktop app. Used in header and favicon. */
export function AppLogo({ className = "", size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      aria-hidden
      suppressHydrationWarning
    >
      <defs suppressHydrationWarning>
        <linearGradient id="logo-bg-web" x1="0%" y1="0%" x2="100%" y2="100%" suppressHydrationWarning>
          <stop offset="0%" stopColor="#7c6bff" suppressHydrationWarning />
          <stop offset="100%" stopColor="#5344dd" suppressHydrationWarning />
        </linearGradient>
        <linearGradient id="logo-face-web" x1="0%" y1="0%" x2="0%" y2="100%" suppressHydrationWarning>
          <stop offset="0%" stopColor="#8b7dff" suppressHydrationWarning />
          <stop offset="100%" stopColor="#634bff" suppressHydrationWarning />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="6" fill="url(#logo-bg-web)" suppressHydrationWarning />
      <g transform="translate(16, 15.35) scale(1.28) translate(-13.25, -14.75)" suppressHydrationWarning>
        <circle cx="11" cy="10" r="2.25" fill="white" suppressHydrationWarning />
        <path
          d="M11 14v8 M14 14v5 M14 17h4 M18 14v8"
          stroke="white"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          suppressHydrationWarning
        />
      </g>
    </svg>
  );
}
