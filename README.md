# PurveyOS Storefront

A modern, customizable storefront application for local food producers using the PurveyOS point-of-sale system.

## Overview

This storefront provides customers with a seamless online shopping experience while maintaining real-time integration with the PurveyOS inventory management system. Each farm gets their own branded subdomain storefront with customizable templates and full order management integration.

## Features

### 🎨 Customizable Templates
- **Modern Farm**: Clean, contemporary design with hero sections
- **Classic**: Traditional farm market aesthetic  
- **Minimal**: Simple, product-focused layout

### 🔄 Real-Time POS Integration
- Live inventory sync from PurveyOS
- Orders flow directly into POS system
- Automatic notifications to farm owners
- Offline-first architecture

### 💳 Flexible Payment Options
- Venmo integration
- Zelle support
- Credit card processing (via Stripe)
- Cash on pickup/delivery

### 📱 Mobile-Responsive
- Optimized for all device sizes
- Touch-friendly product browsing
- Streamlined mobile checkout

## Quick Start

### Prerequisites
- Node.js 18+ 
- Access to a Supabase project configured for PurveyOS

### Installation

```bash
# Clone and install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your Supabase credentials

# Start development server
npm run dev
```

### Environment Configuration

Create a `.env` file with:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your-stripe-key
```

## Domain Configuration

### Production Setup
Configure wildcard DNS for `*.purveyos.store` to enable tenant-specific subdomains:

```
happyacres.purveyos.store → Tenant: Happy Acres Farm
freshfields.purveyos.store → Tenant: Fresh Fields Co-op
```

### Local Development
The app includes fallback logic for local development and will show demo data when Supabase is not configured.

## Architecture

### Data Flow
1. **POS System** → Products marked "online" sync to Supabase
2. **Storefront** → Fetches online products and storefront settings
3. **Customer Orders** → Created in shared database 
4. **POS System** → Receives orders via real-time sync
5. **Notifications** → Sent to farm owners via Edge Functions

### Key Components

#### Tenant Resolution
```typescript
// Automatically detects tenant from subdomain
const { tenant } = useTenantFromDomain();
```

#### Real-Time Data
```typescript
// Fetches products marked as online for the tenant
const { data } = useStorefrontData(tenant?.id);
```

#### Checkout Processing
```typescript
// Creates orders that appear in POS system
const { createOrder } = useCheckout();
```

## Customization

### Template Selection
Templates are configured per-tenant in the PurveyOS settings:

```typescript
// Available templates
const templates = {
  'modern': ModernFarmTemplate,
  'classic': ClassicTemplate,
  'minimal': MinimalTemplate
};
```

### Branding Customization
Each storefront supports:
- Custom colors (primary/accent)
- Logo upload
- Hero imagery
- Farm description
- Contact information

## Development

### File Structure
```
src/
├── components/       # Reusable UI components
├── hooks/           # React hooks for data fetching
├── lib/             # Utilities and configurations
├── pages/           # Page components (checkout, cart, etc.)
├── templates/       # Storefront template themes
├── types/           # TypeScript type definitions
└── App.tsx          # Main app routing
```

### Key Hooks

- **`useTenantFromDomain`**: Resolves tenant from current domain
- **`useStorefrontData`**: Fetches products, categories, and settings
- **`usePersistedCart`**: Manages shopping cart state
- **`useCheckout`**: Handles order creation and payment processing

### Testing Integration

1. Set up a test tenant in PurveyOS
2. Configure storefront settings and enable it
3. Add products and mark them as "available online"
4. Test the complete order flow from storefront to POS

## Deployment

### Build for Production

```bash
npm run build
npm run preview  # Test production build
```

### Environment Variables
Ensure all required environment variables are set:

```bash
# Supabase
VITE_SUPABASE_URL=your-production-url
VITE_SUPABASE_ANON_KEY=your-production-key

# Stripe (for card payments)
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your-key
```

### Wildcard SSL
Configure SSL certificates for `*.purveyos.store` to support all tenant subdomains.

## Integration Documentation

For comprehensive integration details, database schema, and setup instructions, see [INTEGRATION.md](./INTEGRATION.md).

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with a local PurveyOS instance
5. Submit a pull request

## License

This project is proprietary software for PurveyOS customers.

## Support

For technical support or integration questions:
- 📧 Email: support@purveyos.com
- 📚 Documentation: [docs.purveyos.com](https://docs.purveyos.com)
- 🎥 Video Guides: Available in PurveyOS Settings → Storefront

---

**Note**: This storefront is designed specifically for integration with the PurveyOS point-of-sale system and requires an active PurveyOS subscription with storefront features enabled.
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
