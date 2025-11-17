import type { Product } from '../types/product';

/**
 * Check if a product is low on stock based on inventory and reminder threshold
 */
export function isLowStock(product: Product): boolean {
  if (!product.inventory || !product.reminderThreshold) {
    return false;
  }
  return product.inventory <= product.reminderThreshold && product.inventory > 0;
}

/**
 * Check if a product is out of stock
 */
export function isOutOfStock(product: Product): boolean {
  return product.isSoldOut || !product.available || (product.inventory !== undefined && product.inventory <= 0);
}

/**
 * Get inventory status for a product
 */
export function getInventoryStatus(product: Product): 'in-stock' | 'low-stock' | 'out-of-stock' {
  if (isOutOfStock(product)) {
    return 'out-of-stock';
  }
  if (isLowStock(product)) {
    return 'low-stock';
  }
  return 'in-stock';
}

/**
 * Get inventory warning message for farmers/admins
 */
export function getInventoryWarning(product: Product): string | null {
  const status = getInventoryStatus(product);
  
  if (status === 'out-of-stock') {
    if (product.restockDate) {
      return `Out of stock. Restock date: ${new Date(product.restockDate).toLocaleDateString()}`;
    }
    return 'Out of stock. Set a restock date.';
  }
  
  if (status === 'low-stock' && product.inventory && product.reminderThreshold) {
    return `Low stock: ${product.inventory} remaining (threshold: ${product.reminderThreshold})`;
  }
  
  return null;
}

/**
 * Format restock date for display
 */
export function formatRestockDate(restockDate: string | undefined): string | null {
  if (!restockDate) return null;
  
  const date = new Date(restockDate);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  // Reset time for comparison
  today.setHours(0, 0, 0, 0);
  tomorrow.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  
  if (date.getTime() === today.getTime()) {
    return 'Today';
  }
  if (date.getTime() === tomorrow.getTime()) {
    return 'Tomorrow';
  }
  
  // Check if within this week
  const daysDiff = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff > 0 && daysDiff <= 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
