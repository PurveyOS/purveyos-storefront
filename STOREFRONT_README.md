# PurveyOS Storefront

A multi-tenant storefront front-end built with React, TypeScript, Vite, and TailwindCSS. This application connects to PurveyOS (weight-based POS/inventory system) and provides customizable storefronts for farms and vendors.

## Features

- **Multi-tenant Architecture**: Each farm/vendor has their own customizable storefront
- **Template System**: Multiple React component templates for different layouts
- **Tenant-specific Branding**: Custom colors, logos, hero images, and content
- **Product Management**: Display products organized by categories
- **Cart Functionality**: Add/remove products, manage quantities
- **Responsive Design**: Mobile-first design with TailwindCSS

## Architecture

### Core Components

- **StorefrontRoot**: Main component that resolves tenant, loads data, and renders the appropriate template
- **Template Registry**: Centralized system for managing and switching between templates
- **Hooks**: Reusable logic for tenant resolution and data fetching
- **Multi-tenant Data**: Structured to support different tenants with their own settings and products

### Templates

1. **Classic Template**: Full-featured layout with hero section, categories, and product grid
2. **Minimal Template**: Clean, simple layout focusing on products

### Data Structure

- **Tenant Resolution**: Currently stubbed to return "demo-farm" for development
- **Settings**: Tenant-specific branding, colors, and content
- **Products**: Product catalog with pricing, images, and availability
- **Categories**: Product organization and filtering

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Development

The application is currently set up with mock data for development. Key files:

- `/src/StorefrontRoot.tsx` - Main application component
- `/src/templates/` - Template components
- `/src/hooks/useStorefrontData.ts` - Mock data and API hooks
- `/src/hooks/useTenantFromDomain.ts` - Tenant resolution logic

## Future Integrations

- **Supabase Integration**: Replace mock data with real database calls
- **Domain-based Tenant Resolution**: Automatic tenant detection from subdomain
- **Payment Processing**: Complete checkout flow
- **Inventory Management**: Real-time inventory tracking
- **PurveyOS Integration**: Connect to weight-based POS system

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **TailwindCSS 4** - Utility-first CSS framework
- **React Router** - Client-side routing

## Getting Started

1. Clone this repository
2. Install dependencies: `npm install`
3. Start the development server: `npm run dev`
4. Open http://localhost:5174 in your browser

The storefront will load with demo data showing the "Demo Farm" tenant with sample products across different categories (Beef, Pork, Chicken).

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── ProductCard.tsx
│   ├── HeroSection.tsx
│   ├── Navbar.tsx
│   └── Footer.tsx
├── hooks/               # Custom React hooks
│   ├── useTenantFromDomain.ts
│   └── useStorefrontData.ts
├── pages/               # Route-level page components
│   ├── HomePage.tsx
│   ├── ProductPage.tsx
│   ├── CartPage.tsx
│   └── CheckoutPage.tsx
├── templates/           # Storefront template components
│   ├── index.ts
│   ├── ClassicTemplate.tsx
│   └── MinimalTemplate.tsx
├── types/               # TypeScript type definitions
│   ├── storefront.ts
│   ├── product.ts
│   └── category.ts
├── utils/               # Utility functions
│   └── color.ts
├── App.tsx              # Main App component
├── StorefrontRoot.tsx   # Core storefront logic
└── main.tsx             # Application entry point
```