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
  // Optional weight-bin selection
  binWeight?: number; // e.g., 1.0 lb, 2.5 lb
  unitPriceCents?: number; // price per unit (e.g., per lb) in cents
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
  onAddToCart: (productId: string, quantity?: number, options?: { binWeight?: number; unitPriceCents?: number }) => void;
  onRemoveFromCart: (productId: string, options?: { binWeight?: number }) => void;
  onAddBinToCart?: (productId: string, binWeight: number, unitPriceCents: number) => void;
}

export interface StorefrontData {
  settings: StorefrontSettings;
  products: Product[];
  categories: Category[];
}