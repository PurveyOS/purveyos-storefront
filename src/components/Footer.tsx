import type { StorefrontSettings } from '../types/storefront';

// Existing interface for ClassicTemplate compatibility
interface ClassicFooterProps {
  settings: StorefrontSettings;
}

// New interface for ModernFarmTemplate
interface ModernFooterProps {
  storeName?: string;
}

type FooterProps = ClassicFooterProps | ModernFooterProps;

function isClassicProps(props: FooterProps): props is ClassicFooterProps {
  return 'settings' in props;
}

export function Footer(props: FooterProps) {
  const currentYear = new Date().getFullYear();

  if (isClassicProps(props)) {
    // Classic template footer
    const { settings } = props;

    return (
      <footer className="bg-gray-800 text-white">
        <div className="container mx-auto px-4 py-12">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <img
                  src={settings.logoUrl}
                  alt={settings.farmName}
                  className="h-8 w-auto"
                />
                <span className="font-bold text-xl">{settings.farmName}</span>
              </div>
              {settings.farmDescription && (
                <p className="text-gray-300 mb-4">{settings.farmDescription}</p>
              )}
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-4">Quick Links</h3>
              <ul className="space-y-2 text-gray-300">
                <li>
                  <a href="/" className="hover:text-white transition-colors">
                    Home
                  </a>
                </li>
                <li>
                  <a href="/products" className="hover:text-white transition-colors">
                    Products
                  </a>
                </li>
                <li>
                  <a href="/cart" className="hover:text-white transition-colors">
                    Cart
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-4">Contact</h3>
              <div className="space-y-2 text-gray-300">
                {settings.contactEmail && (
                  <div>
                    <span className="block">Email:</span>
                    <a
                      href={`mailto:${settings.contactEmail}`}
                      className="hover:text-white transition-colors"
                    >
                      {settings.contactEmail}
                    </a>
                  </div>
                )}
                {settings.contactPhone && (
                  <div>
                    <span className="block">Phone:</span>
                    <a
                      href={`tel:${settings.contactPhone}`}
                      className="hover:text-white transition-colors"
                    >
                      {settings.contactPhone}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-gray-700 mt-8 pt-8 text-center text-gray-300">
            <p>&copy; {currentYear} {settings.farmName}. All rights reserved.</p>
          </div>
        </div>
      </footer>
    );
  } else {
    // Modern template footer
    const { storeName } = props;

    return (
      <footer className="bg-white border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <p className="text-xs text-slate-500 text-center">
            © {currentYear} {storeName || 'Farm Store'} · Powered by PurveyOS – Made by producers for producers.
          </p>
        </div>
      </footer>
    );
  }
}