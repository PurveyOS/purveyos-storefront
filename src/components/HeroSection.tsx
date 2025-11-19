import type { StorefrontSettings } from '../types/storefront';

interface HeroSectionProps {
  settings: StorefrontSettings;
}

export function HeroSection({ settings }: HeroSectionProps) {
  const heroStyle = {
    backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url(${settings.heroImageUrl})`,
    backgroundColor: settings.primaryColor,
  };

  return (
    <section
      className="relative bg-cover bg-center bg-no-repeat min-h-[500px] flex items-center"
      style={heroStyle}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-black/30"></div>
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32 w-full">
        <div className="max-w-4xl mx-auto text-center text-white">
          <h1
            className="text-balance text-3xl sm:text-4xl md:text-5xl font-bold leading-tight max-w-[18ch]"
              >
            {settings.heroHeading}
            </h1>
          <p className="text-xl md:text-2xl mb-8 opacity-90 leading-relaxed max-w-2xl mx-auto font-medium">
            {settings.heroSubtitle}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              className="px-8 py-4 text-lg font-semibold rounded-lg transition-all duration-200 hover:opacity-90 transform hover:scale-105 shadow-lg"
              style={{ backgroundColor: settings.accentColor, color: '#000' }}
              onClick={() => {
                document.getElementById('products-section')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Shop Now
            </button>
            <button
              className="px-8 py-4 text-lg font-semibold rounded-lg border-2 border-white text-white hover:bg-white hover:text-gray-900 transition-all duration-200 transform hover:scale-105"
              onClick={() => {
                document.getElementById('about-section')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Learn More
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}