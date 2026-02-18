export interface Product {
  id: string;
  name: string;
  description: string;
  pricePer: number;
  unit: string; // e.g., "lb", "oz", "piece", "dozen"
  variantSize?: number; // e.g., 12 for 12 oz (fixed-price variants)
  variantUnit?: string; // e.g., "oz", "ml", "fl oz"
  pricingMode?: 'fixed' | 'weight'; // fixed = sell by unit count, weight = sell by weight
  // Storefront ordering modes
  order_mode?: 'exact_package' | 'pack_for_you' | null; // nullable override
  pack_for_you_min_lbs?: number | null;
  pack_for_you_step_lbs?: number | null;
  pack_for_you_max_overage_pct?: number | null;
  pack_for_you_max_underage_pct?: number | null;
  pack_for_you_price_buffer_pct?: number | null;
  weightBins?: Array<{
    weightBtn: number;
    unitPriceCents: number;
    qty: number;
    reservedQty?: number;
    binKind?: string | null; // null = legacy package_group, 'bulk_weight' = bulk
    qtyLbs?: number | null; // For bulk bins only: weight on hand (lbs)
    reservedLbs?: number; // For bulk bins only: weight reserved (lbs)
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
    duration_intervals?: number;
    season_start_date?: string;
    season_end_date?: string;
    min_interval?: number;
    substitutionGroups?: Array<{
      groupName: string;
      options: Array<{
        productId: string;
        productName: string;
        requiredQuantity: number;
        unit: string;
        isOptional?: boolean;
      }>;
    }>;
  };
  
  // Deposit fields
  is_deposit_product?: boolean;
  deposit_prod_price_per_lb?: number; // Price per lb for hanging weight on deposit products
  
  // Reservation fields
  reservedWeightLbs?: number; // Product-level reserved weight (lbs)
}