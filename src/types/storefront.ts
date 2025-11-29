import type { Product } from './product';
import type { Category } from './category';

export interface StorefrontSettings {
  templateId: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string;
  heroImageUrl: string;
  heroHeading: string;
  heroSubtitle: string;
  farmName: string;
  farmDescription?: string;
  contactEmail?: string;
  contactPhone?: string;
  darkMode?: boolean;
  featureSections?: Array<{
    imageUrl: string;
    heading?: string;
    subtitle?: string;
    ctaText?: string;
    ctaLink?: string;
  }>;
}

export interface CartItem {
  productId: string;
  quantity: number;
  // Optional weight-bin selection (for pre-packaged items)
  binWeight?: number; // e.g., 1.0 lb, 2.5 lb
  unitPriceCents?: number; // price per unit (e.g., per lb) in cents
  // Optional custom weight (for weight-based pricing)
  weight?: number; // Custom weight amount for weight-based products
  // Pre-order tracking
  isPreOrder?: boolean; // Item is a pre-order
  // Subscription metadata
  metadata?: {
    isSubscription?: boolean;
    subscriptionProductId?: string;
    subscriptionInterval?: 'weekly' | 'biweekly' | 'monthly';
    subscriptionDuration?: string;
    subscriptionDurationIntervals?: number;
    subscriptionTotalPrice?: number;
  };
}

export interface Cart {
  items: CartItem[];
  total: number;
}

export interface StorefrontTemplateProps {
  settings: StorefrontSettings;
  products: Product[];
  categories: Category[];
  cart: Cart;
  onAddToCart: (productId: string, quantity?: number, options?: { binWeight?: number; unitPriceCents?: number; weight?: number; isPreOrder?: boolean; metadata?: any }) => void;
  onRemoveFromCart: (productId: string, options?: { binWeight?: number }) => void;
  onAddBinToCart?: (productId: string, binWeight: number, unitPriceCents: number) => void;
  // Optional feature capability flags (based on subscription tier)
  features?: {
    preOrdersEnabled?: boolean;
    advancedThemesEnabled?: boolean;
    analyticsEnabled?: boolean;
  };
}

export interface StorefrontData {
  settings: StorefrontSettings;
  products: Product[];
  categories: Category[];
}