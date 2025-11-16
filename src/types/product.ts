export interface Product {
  id: string;
  name: string;
  description: string;
  pricePer: number;
  unit: string; // e.g., "lb", "oz", "piece"
  imageUrl: string;
  categoryId: string;
  available: boolean;
  inventory?: number;
}