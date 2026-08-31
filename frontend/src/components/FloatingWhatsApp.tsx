import { Send } from 'lucide-react'
import { useLocation } from 'react-router-dom'

export default function FloatingWhatsApp() {
  // The home page has its own mobile-only sticky bottom nav (see
  // HomePage.tsx) — lift the widget above it there so the two don't overlap
  // on phones; every other page keeps the normal corner position.
  const { pathname } = useLocation()
  const aboveBottomNav = pathname === '/'

  return (
    <a
      href="https://telegram.me/SRLux"
      target="_blank"
      rel="noopener noreferrer"
      className={`fixed right-4 sm:right-5 z-40 flex items-center justify-center w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-sky-500 hover:bg-sky-400 text-white shadow-lg shadow-black/40 transition-all hover:scale-105 ${
        aboveBottomNav ? 'bottom-20 sm:bottom-5' : 'bottom-4 sm:bottom-5'
      }`}
      aria-label="Telegram"
    >
      <Send size={18} className="sm:hidden -translate-x-px" /><Send size={24} className="hidden sm:block -translate-x-px" />
    </a>
  )
}
