import { Link } from 'react-router-dom';
import type { StorefrontSettings, Cart } from '../types/storefront';

// Existing interface for ClassicTemplate compatibility
interface ClassicNavbarProps {
  settings: StorefrontSettings;
  cart: Cart;
}

// New interface for ModernFarmTemplate
interface ModernNavbarProps {
  title: string;
  logoUrl?: string | null;
  cartCount: number;
}

type NavbarProps = ClassicNavbarProps | ModernNavbarProps;

function isClassicProps(props: NavbarProps): props is ClassicNavbarProps {
  return 'settings' in props && 'cart' in props;
}

export function Navbar(props: NavbarProps) {
  if (isClassicProps(props)) {
    // Classic template navbar
    const { settings, cart } = props;
    const cartItemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

    return (
      <nav className="bg-white shadow-lg sticky top-0 z-50 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button 
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex items-center space-x-3 flex-shrink-0 hover:opacity-80 transition-opacity duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-lg p-1"
            >
              <img
                src={settings.logoUrl}
                alt={settings.farmName}
                className="h-8 w-auto"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
              <span className="font-bold text-xl text-gray-900 truncate">
                {settings.farmName}
              </span>
            </button>

            <div className="hidden md:flex items-center space-x-8">
              <Link
                to="/"
                className="text-gray-700 hover:text-blue-600 font-medium transition-colors duration-200 px-3 py-2 rounded-md text-sm"
              >
                Home
              </Link>
              <button
                className="text-gray-700 hover:text-blue-600 font-medium transition-colors duration-200 px-3 py-2 rounded-md text-sm"
                onClick={() => {
                  document.getElementById('products-section')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Products
              </button>
              <Link
                to="/cart"
                className="relative inline-flex items-center"
              >
                <button
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 text-white shadow-md hover:shadow-lg"
                  style={{ 
                    backgroundColor: settings.primaryColor,
                  }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-1.5 6M7 13l-1.5 6m0 0h9"/>
                  </svg>
                  <span>Cart</span>
                  {cartItemCount > 0 && (
                    <span
                      className="absolute -top-2 -right-2 min-w-[20px] h-5 rounded-full text-xs flex items-center justify-center text-black font-bold"
                      style={{ backgroundColor: settings.accentColor }}
                    >
                      {cartItemCount}
                    </span>
                  )}
                </button>
              </Link>
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden">
              <button className="text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 p-2 rounded-md">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </nav>
    );
  } else {
    // Modern template navbar
    const { title, logoUrl, cartCount } = props;

    return (
      <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Left side */}
            <div className="flex items-center gap-3">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt={title}
                  className="h-10 w-10 rounded-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              )}
              <h1 className="text-xl font-semibold text-slate-900 truncate">
                {title}
              </h1>
            </div>

            {/* Right side */}
            <button className="relative flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-full transition-colors duration-200">
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-1.5 6M7 13l-1.5 6m0 0h9"/>
              </svg>
              <span className="text-sm font-medium text-slate-700">Cart</span>
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-emerald-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </nav>
    );
  }
}