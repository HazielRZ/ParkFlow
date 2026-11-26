/**
 * Iconografía SVG vectorial consistente (estilo Lucide, trazo 1.9px, sin emojis nativos).
 * Sin dependencias externas — Licencia: PolyForm Noncommercial License 1.0.0
 */

import React from "react";

function SvgIcon({
  size = 18,
  strokeWidth = 1.9,
  className = "",
  children,
  ...rest
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ? `pf-svg-icon ${className}` : "pf-svg-icon"}
      {...rest}
    >
      {children}
    </svg>
  );
}

export function SunIcon(props) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </SvgIcon>
  );
}

export function MoonIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </SvgIcon>
  );
}

export function Volume2Icon(props) {
  return (
    <SvgIcon {...props}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </SvgIcon>
  );
}

export function SquareStopIcon(props) {
  return (
    <SvgIcon {...props}>
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
    </SvgIcon>
  );
}

export function LockIcon(props) {
  return (
    <SvgIcon {...props}>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </SvgIcon>
  );
}

export function StarIcon(props) {
  return (
    <SvgIcon {...props}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </SvgIcon>
  );
}

export function NavigationIcon(props) {
  return (
    <SvgIcon {...props}>
      <polygon points="3 11 22 2 13 21 11 13 3 11" />
    </SvgIcon>
  );
}

export function LayoutGridIcon(props) {
  return (
    <SvgIcon {...props}>
      <rect width="7" height="7" x="3" y="3" rx="1.5" />
      <rect width="7" height="7" x="14" y="3" rx="1.5" />
      <rect width="7" height="7" x="14" y="14" rx="1.5" />
      <rect width="7" height="7" x="3" y="14" rx="1.5" />
    </SvgIcon>
  );
}

export function ParkingSquareIcon(props) {
  return (
    <SvgIcon {...props}>
      <rect width="18" height="18" x="3" y="3" rx="3" />
      <path d="M9 17V7h4a3 3 0 0 1 0 6H9" />
    </SvgIcon>
  );
}

export function SlidersIcon(props) {
  return (
    <SvgIcon {...props}>
      <line x1="4" x2="4" y1="21" y2="14" />
      <line x1="4" x2="4" y1="10" y2="3" />
      <line x1="12" x2="12" y1="21" y2="12" />
      <line x1="12" x2="12" y1="8" y2="3" />
      <line x1="20" x2="20" y1="21" y2="16" />
      <line x1="20" x2="20" y1="12" y2="3" />
      <line x1="2" x2="6" y1="14" y2="14" />
      <line x1="10" x2="14" y1="8" y2="8" />
      <line x1="18" x2="22" y1="16" y2="16" />
    </SvgIcon>
  );
}

export function GraduationCapIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
      <path d="M22 10v6" />
      <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
    </SvgIcon>
  );
}

export function IdCardIcon(props) {
  return (
    <SvgIcon {...props}>
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <circle cx="8" cy="12" r="2" />
      <path d="M14 10h4" />
      <path d="M14 14h4" />
    </SvgIcon>
  );
}

export function AlertTriangleIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </SvgIcon>
  );
}

export function ClockIcon(props) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </SvgIcon>
  );
}

export function CheckIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M20 6 9 17l-5-5" />
    </SvgIcon>
  );
}

export function CheckCircleIcon(props) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </SvgIcon>
  );
}

export function RefreshCwIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </SvgIcon>
  );
}

export function XIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </SvgIcon>
  );
}

export function ChevronLeftIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="m15 18-6-6 6-6" />
    </SvgIcon>
  );
}

export function ChevronRightIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="m9 18 6-6-6-6" />
    </SvgIcon>
  );
}

export function ChevronDownIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="m6 9 6 6 6-6" />
    </SvgIcon>
  );
}

export function ArrowLeftIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </SvgIcon>
  );
}

export function ArrowRightIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </SvgIcon>
  );
}

export function ArrowUpRightIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M7 7h10v10" />
      <path d="M7 17 17 7" />
    </SvgIcon>
  );
}

export function MapPinIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </SvgIcon>
  );
}

export function CarIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
      <circle cx="7" cy="17" r="2" />
      <path d="M9 17h6" />
      <circle cx="17" cy="17" r="2" />
    </SvgIcon>
  );
}

export function SparklesIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </SvgIcon>
  );
}

export function BarChart3Icon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </SvgIcon>
  );
}

/**
 * Vista cenital arquitectónica de automóvil para cajones ocupados en el croquis.
 * Orientada hacia el carril central (`facing="right"` en Bloque A, `"left"` en Bloque B).
 */
export function TopDownCarSvg({ facing = "right", className = "" }) {
  const rotate = facing === "left" ? "rotate(180 46 21)" : undefined;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 92 42"
      aria-hidden="true"
      className={className ? `pf-topdown-car ${className}` : "pf-topdown-car"}
    >
      <g transform={rotate}>
        {/* Llantas */}
        <rect x="14" y="2" width="16" height="4" rx="2" fill="var(--car-glass)" opacity="0.85" />
        <rect x="60" y="2" width="16" height="4" rx="2" fill="var(--car-glass)" opacity="0.85" />
        <rect x="14" y="36" width="16" height="4" rx="2" fill="var(--car-glass)" opacity="0.85" />
        <rect x="60" y="36" width="16" height="4" rx="2" fill="var(--car-glass)" opacity="0.85" />

        {/* Carrocería */}
        <rect
          x="5"
          y="5"
          width="82"
          height="32"
          rx="11"
          fill="var(--car-body)"
        />
        {/* Parabrisas y medallón */}
        <rect
          x="19"
          y="8.5"
          width="52"
          height="25"
          rx="7"
          fill="var(--car-glass)"
        />
        {/* Toldo */}
        <rect
          x="29"
          y="10.5"
          width="28"
          height="21"
          rx="4.5"
          fill="var(--car-body)"
          opacity="0.92"
        />
        {/* Faros frontales */}
        <rect x="83" y="9" width="3" height="6" rx="1.5" fill="var(--bg-surface)" opacity="0.7" />
        <rect x="83" y="27" width="3" height="6" rx="1.5" fill="var(--bg-surface)" opacity="0.7" />
      </g>
    </svg>
  );
}
