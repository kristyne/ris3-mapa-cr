import { Link, useLocation } from 'react-router-dom'

export default function Header() {
  const { pathname } = useLocation()
  const isDashboard = pathname.startsWith('/dashboard')

  return (
    <header className="bg-white/95 backdrop-blur-sm border-b border-ris3-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-5 h-14 flex items-center justify-between">
        <Link
          to="/"
          className="text-sm font-bold tracking-tight text-ris3-blue no-underline hover:opacity-80"
        >
          RIS3 Mapa ČR
        </Link>
        <nav className="flex gap-1">
          <NavLink to="/" active={!isDashboard}>Příběh</NavLink>
          <NavLink to="/dashboard" active={isDashboard}>Dashboard</NavLink>
        </nav>
      </div>
    </header>
  )
}

function NavLink({ to, active, children }) {
  return (
    <Link
      to={to}
      className={`no-underline text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
        active
          ? 'bg-ris3-blue text-white'
          : 'text-ris3-gray-500 hover:text-ris3-gray-900 hover:bg-ris3-gray-50'
      }`}
    >
      {children}
    </Link>
  )
}
