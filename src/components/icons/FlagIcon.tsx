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
      {/* 旗杆 */}
      <path 
        d="M20 10 L20 90" 
        stroke="currentColor" 
        strokeWidth="6" 
        strokeLinecap="round"
      />
      {/* 上层旗帜 */}
      <path 
        d="M20 15 L20 50 Q35 55 50 45 Q65 35 80 45 L80 15 Q65 5 50 15 Q35 25 20 15" 
        stroke="currentColor" 
        strokeWidth="6" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
      {/* 下层旗帜折角 */}
      <path 
        d="M50 45 Q65 35 80 45 L80 60 Q65 70 50 60 L50 45" 
        stroke="currentColor" 
        strokeWidth="6" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
    </svg>
  )
}
