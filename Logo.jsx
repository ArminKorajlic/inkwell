import React, { useId } from 'react'

export const APP_NAME = 'Inkwell'
export const APP_TAGLINE = 'Write it down, draw it out, get it done.'

// The Inkwell mark: a pen nib inside a drop of ink, on a dark tile.
export default function Logo({ size = 24, title = APP_NAME }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const bg = 'ikbg' + uid
  const ink = 'ikink' + uid
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title}
      style={{ display: 'block', flex: '0 0 auto' }}>
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#24242B" /><stop offset="1" stopColor="#121216" />
        </linearGradient>
        <linearGradient id={ink} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3FD0F5" /><stop offset="1" stopColor="#2E6CF6" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="23" fill={`url(#${bg})`} />
      <path d="M50 14C50 14 26 44 26 60a24 24 0 0 0 48 0C74 44 50 14 50 14z" fill={`url(#${ink})`} />
      <path d="M50 40l12 18-12 20-12-20z" fill="#fff" />
      <path d="M50 58v20" stroke="#2E6CF6" strokeWidth="2.4" />
      <circle cx="50" cy="55" r="3.2" fill="#2E6CF6" />
    </svg>
  )
}
