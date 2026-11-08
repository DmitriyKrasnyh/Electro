import type { ReactNode } from "react"

// Иконки прямо в коде: отдельная библиотека ради пяти значков не нужна.
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="square"
      className="shrink-0"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function ArrowLeftIcon() {
  return (
    <Icon>
      <path d="M20 12H5M11 5l-7 7 7 7" />
    </Icon>
  )
}

export function ArrowRightIcon() {
  return (
    <Icon>
      <path d="M4 12h15M13 5l7 7-7 7" />
    </Icon>
  )
}

export function CameraIcon() {
  return (
    <Icon>
      <path d="M3 8h4l2-3h6l2 3h4v12H3z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </Icon>
  )
}

export function ImageIcon() {
  return (
    <Icon>
      <rect x="3" y="4" width="18" height="16" />
      <path d="M3 17l5-5 4 4 3-3 6 6" />
    </Icon>
  )
}

export function LockIcon() {
  return (
    <Icon>
      <rect x="5" y="11" width="14" height="10" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Icon>
  )
}

export function CheckIcon() {
  return (
    <Icon>
      <path d="M5 13l4 4 10-11" />
    </Icon>
  )
}

export function CloseIcon() {
  return (
    <Icon>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  )
}

export function PlusIcon() {
  return (
    <Icon>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  )
}

export function FitScreenIcon() {
  return (
    <Icon>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </Icon>
  )
}

export function PencilIcon() {
  return (
    <Icon>
      <path d="M4 20l1-5L16 4l4 4L9 19l-5 1zM13.5 6.5l4 4" />
    </Icon>
  )
}

export function ChevronDownIcon() {
  return (
    <Icon>
      <path d="M5 9l7 7 7-7" />
    </Icon>
  )
}
