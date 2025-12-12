import { Link } from 'react-router-dom';
import { useState } from 'react';
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
  primaryColor?: string;
  accentColor?: string;
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
      <nav className="bg-white shadow-sm sticky top-0 z-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            
            <button 
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex items-center space-x-3 flex-shrink-0 hover:opacity-80 transition-opacity duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-lg p-1"
            >
              {settings.logoUrl && (
                <img
                  src={settings.logoUrl}
                  alt={settings.farmName}
                  className="h-8 w-auto"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              )}
              <span className="font-bold text-lg text-slate-900 truncate">
                {settings.farmName}
              </span>
            </button>

            <div className="hidden md:flex items-center space-x-8">
              <Link
                to="/"
                className="text-slate-700 hover:text-blue-600 font-medium transition-colors duration-200 px-3 py-2 rounded-md text-sm"
              >
                Home
              </Link>
              <button
                className="text-slate-700 hover:text-blue-600 font-medium transition-colors duration-200 px-3 py-2 rounded-md text-sm"
                onClick={() => {
                  document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Products
              </button>
              <Link
                to="/account"
                className="text-slate-700 hover:text-blue-600 font-medium transition-colors duration-200 px-3 py-2 rounded-md text-sm"
              >
                My Account
              </Link>
              <Link
                to="/cart"
                className="relative inline-flex items-center"
              >
                <button
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 text-white shadow-sm hover:shadow-md"
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
                      className="absolute -top-2 -right-2 min-w-[20px] h-5 rounded-full text-xs flex items-center justify-center text-black font-bold px-1.5"
                      style={{ backgroundColor: settings.accentColor }}
                    >
                      {cartItemCount}
                    </span>
                  )}
                </button>
              </Link>
            </div>

            {/* Mobile navigation - hidden cart, only show tabs */}
            <div className="md:hidden flex items-center space-x-4">
              <Link
                to="/"
                className="text-slate-700 hover:text-blue-600 font-medium transition-colors duration-200 px-2 py-2 rounded-md text-sm"
              >
                Home
              </Link>
              <button
                className="text-slate-700 hover:text-blue-600 font-medium transition-colors duration-200 px-2 py-2 rounded-md text-sm"
                onClick={() => {
                  document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Products
              </button>
              <Link
                to="/account"
                className="text-slate-700 hover:text-blue-600 font-medium transition-colors duration-200 px-2 py-2 rounded-md text-sm"
              >
                Account
              </Link>
            </div>
          </div>
        </div>
      </nav>
    );
  } else {
    // Modern template navbar
    const { title, logoUrl, cartCount, primaryColor = '#0f6fff', accentColor = '#ffcc00' } = props;
    const [menuOpen, setMenuOpen] = useState(false);

    return (
      <nav className="bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Left side - Menu Dropdown */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200"
                aria-label="Menu"
              >
                <svg className="w-6 h-6 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              
              {/* Dropdown Menu */}
              {menuOpen && (
                <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden z-50">
                  <Link
                    to="/"
                    className="block px-4 py-3 text-slate-700 hover:bg-gray-50 transition-colors duration-200"
                    onClick={() => setMenuOpen(false)}
                  >
                    Home
                  </Link>
                  <button
                    onClick={() => {
                      document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-3 text-slate-700 hover:bg-gray-50 transition-colors duration-200"
                  >
                    Products
                  </button>
                  <Link
                    to="/account"
                    className="block px-4 py-3 text-slate-700 hover:bg-gray-50 transition-colors duration-200 border-t border-gray-200"
                    onClick={() => setMenuOpen(false)}
                  >
                    My Account
                  </Link>
                </div>
              )}
            </div>

            {/* Center - Logo */}
            <div className="flex-1 flex justify-center">
              <button
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="flex items-center gap-3 hover:opacity-80 transition-opacity duration-200 focus:outline-none"
              >
                {logoUrl && (
                  <img
                    src={logoUrl}
                    alt={title}
                    className="h-12 w-12 sm:h-14 sm:w-14 rounded-full object-cover shadow-md"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                )}
                <div className="text-center hidden sm:block">
                  <h1 className="text-lg sm:text-xl font-bold text-slate-900">
                    {title}
                  </h1>
                </div>
              </button>
            </div>

            {/* Right side - Cart & Account */}
            <div className="flex items-center gap-2 sm:gap-3">
              <Link to="/account" className="inline-flex hidden sm:flex">
                <button
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full transition-colors duration-200 text-sm font-medium hover:bg-gray-100"
                  style={{ color: primaryColor }}
                  aria-label="My Account"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                  </svg>
                  <span className="hidden sm:inline">Account</span>
                </button>
              </Link>
              <Link to="/cart" className="relative inline-flex">
                <button
                  className="relative flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 rounded-full transition-colors duration-200 shadow-sm hover:shadow-md text-sm font-medium"
                  style={{ backgroundColor: '#fff', border: `2px solid ${primaryColor}` }}
                  aria-label="Open cart"
                >
                  <svg className="w-5 h-5" style={{ color: primaryColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-1.5 6M7 13l-1.5 6m0 0h9"/>
                  </svg>
                  <span className="hidden sm:inline" style={{ color: primaryColor }}>Cart</span>
                  {cartCount > 0 && (
                    <span
                      className="absolute -top-1 -right-1 min-w-[22px] h-6 text-white text-xs font-bold rounded-full flex items-center justify-center"
                      style={{ backgroundColor: accentColor }}
                    >
                      {cartCount}
                    </span>
                  )}
                </button>
              </Link>
            </div>
          </div>
        </div>
      </nav>
    );
  }
}