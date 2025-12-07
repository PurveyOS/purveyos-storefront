export interface Product {
  id: string;
  name: string;
  description: string;
  pricePer: number;
  unit: string; // e.g., "lb", "oz", "piece", "dozen"
  pricingMode?: 'fixed' | 'weight'; // fixed = sell by unit count, weight = sell by weight
  weightBins?: Array<{
    weightBtn: number;
    unitPriceCents: number;
    qty: number;
  }>;
  imageUrl: string;
  categoryId: string;
  available: boolean;
  inventory?: number;
  
  // Sold-out and pre-order fields
  isSoldOut?: boolean; // Product is currently out of stock
  allowPreOrder?: boolean; // Allow customers to pre-order if sold out
  restockDate?: string; // ISO date string for when product will be back in stock
  
  // Product notes
  specialNotes?: string; // Special instructions or notes from farmer (e.g., "Frozen only", "Call ahead")
  
  // Inventory management
  reminderThreshold?: number; // Notify owner when inventory falls below this amount
  
  // Subscription fields
  isSubscription?: boolean;
  subscriptionData?: {
    id: string;
    price_per_interval: number;
    interval_type: 'weekly' | 'biweekly' | 'monthly';
    duration_type: 'ongoing' | 'fixed_duration' | 'seasonal';
    season_start_date?: string;
    season_end_date?: string;
  };
  
  // Deposit field
  is_deposit_product?: boolean;
}