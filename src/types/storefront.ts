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
  onAddToCart: (productId: string, quantity?: number) => void;
  onRemoveFromCart: (productId: string) => void;
}

export interface StorefrontData {
  settings: StorefrontSettings;
  products: Product[];
  categories: Category[];
}