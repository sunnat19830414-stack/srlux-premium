import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

// Client-side routing doesn't reset scroll position the way a full page
// load does, so navigating from a scrolled-down catalog list into a
// product page previously opened wherever the browser happened to be
// scrolled to. Only resets on PUSH (a genuine "go to a new page" click) —
// on POP (browser back/forward) we deliberately leave scroll alone so the
// browser's own scroll restoration can put the user back where they were.
export default function ScrollToTop() {
  const { pathname } = useLocation()
  const navigationType = useNavigationType()

  useEffect(() => {
    if (navigationType !== 'POP') {
      window.scrollTo(0, 0)
    }
  }, [pathname, navigationType])

  return null
}
