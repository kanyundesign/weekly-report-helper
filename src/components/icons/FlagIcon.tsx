interface FlagIconProps {
  className?: string
}

export function FlagIcon({ className = 'w-6 h-6' }: FlagIconProps) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <path 
        d="M20 15 L20 85 M20 15 L20 55 Q20 60 25 62 L70 75 Q80 78 80 70 L80 25 Q80 17 70 20 L25 33 Q20 35 20 40" 
        stroke="currentColor" 
        strokeWidth="8" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
    </svg>
  )
}

