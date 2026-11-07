import { useId } from "react";

export function Logo({
  className,
  showWord = true,
}: {
  className?: string;
  showWord?: boolean;
}) {
  const gid = `sc-g-${useId().replace(/:/g, "")}`;
  return (
    <span
      aria-label="ShelfCheck"
      role="img"
      className={`inline-flex items-center gap-2 ${className ?? ""}`}
    >
      <svg
        viewBox="0 0 32 32"
        width="1.6em"
        height="1.6em"
        aria-hidden="true"
        focusable="false"
        className="shrink-0"
      >
        <defs>
          <linearGradient
            id={gid}
            x1="11"
            y1="22"
            x2="21"
            y2="16"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#0071e3" />
            <stop offset=".55" stopColor="#8a3ffc" />
            <stop offset="1" stopColor="#e8457d" />
          </linearGradient>
        </defs>
        <path
          d="M16 3.5C12.6 7.9 7 13.4 7 19.4a9 9 0 0 0 18 0C25 13.4 19.4 7.9 16 3.5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d="M11.6 19.6l3.2 3.2 5.9-6.6"
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showWord && (
        <span aria-hidden="true" className="font-semibold tracking-tight">
          ShelfCheck
        </span>
      )}
    </span>
  );
}

export default Logo;
