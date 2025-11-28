import { useState, useEffect } from 'react';
import type { Cart } from '../types/storefront';
import { trackAddToCart, trackClearCart, trackRemoveFromCart } from '../utils/analytics';
import toast from 'react-hot-toast';

const CART_STORAGE_KEY = 'purveyos-cart';

export function usePersistedCart() {
  const [cart, setCart] = useState<Cart>({
    items: [],
    total: 0,
  });

  // Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem(CART_STORAGE_KEY);
    if (savedCart) {
      try {
        const parsedCart = JSON.parse(savedCart);
        setCart(parsedCart);
      } catch (error) {
        console.error('Error parsing saved cart:', error);
      }
    }
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  const addToCart = (productId: string, quantity: number = 1, options?: { binWeight?: number; unitPriceCents?: number; weight?: number; isPreOrder?: boolean }) => {
    setCart(prev => {
      const existingItem = prev.items.find(item => 
        item.productId === productId && 
        item.binWeight === options?.binWeight &&
        item.weight === options?.weight
      );
      
      if (existingItem) {
        const updated = {
          ...prev,
          items: prev.items.map(item =>
            item.productId === productId && 
            item.binWeight === options?.binWeight &&
            item.weight === options?.weight
              ? { ...item, quantity: item.quantity + quantity }
              : item
          ),
        };
        try { trackAddToCart({ productId, quantity, ...options }); } catch {}
        
        // Show toast notification
        const itemDesc = options?.binWeight 
          ? `${options.binWeight} lb package` 
          : options?.weight 
          ? `${options.weight} lb` 
          : `${quantity} item${quantity > 1 ? 's' : ''}`;
        toast.success(`Added ${itemDesc} to cart`);
        
        return updated;
      }

      const next = {
        ...prev,
        items: [...prev.items, { 
          productId, 
          quantity, 
          binWeight: options?.binWeight, 
          unitPriceCents: options?.unitPriceCents,
          weight: options?.weight,
          isPreOrder: options?.isPreOrder
        }],
      };
      try { trackAddToCart({ productId, quantity, ...options }); } catch {}
      
      // Show toast notification
      const itemDesc = options?.binWeight 
        ? `${options.binWeight} lb package` 
        : options?.weight 
        ? `${options.weight} lb` 
        : `${quantity} item${quantity > 1 ? 's' : ''}`;
      toast.success(`Added ${itemDesc} to cart`);
      
      return next;
    });
  };

  const removeFromCart = (productId: string, options?: { binWeight?: number }) => {
    setCart(prev => {
      const existingItem = prev.items.find(item => item.productId === productId && (options?.binWeight === undefined || item.binWeight === options.binWeight));
      
      if (!existingItem) return prev;
      
      if (existingItem.quantity <= 1) {
        const updated = {
          ...prev,
          items: prev.items.filter(item => !(item.productId === productId && (options?.binWeight === undefined || item.binWeight === options.binWeight))),
        };
        try { trackRemoveFromCart({ productId, quantity: 1, binWeight: options?.binWeight }); } catch {}
        return updated;
      }

      const next = {
        ...prev,
        items: prev.items.map(item =>
          item.productId === productId && (options?.binWeight === undefined || item.binWeight === options.binWeight)
            ? { ...item, quantity: item.quantity - 1 }
            : item
        ),
      };
      try { trackRemoveFromCart({ productId, quantity: 1, binWeight: options?.binWeight }); } catch {}
      return next;
    });
  };

  const clearCart = () => {
    setCart({ items: [], total: 0 });
    try { trackClearCart(); } catch {}
  };

  const updateCartTotal = (products: any[]) => {
    const total = cart.items.reduce((sum, item) => {
      const product = products.find(p => p.id === item.productId);
      if (!product) return sum;
      
      // Handle pre-packaged weight bins
      if (item.binWeight && item.unitPriceCents) {
        const linePrice = (item.binWeight * (item.unitPriceCents / 100)) * item.quantity;
        return sum + linePrice;
      }
      
      // Handle weight-based pricing (custom weight entry)
      if (item.weight && product.pricingMode === 'weight') {
        const linePrice = (product.pricePer * item.weight) * item.quantity;
        return sum + linePrice;
      }
      
      // Handle fixed pricing (standard quantity-based)
      return sum + (product.pricePer * item.quantity);
    }, 0);

    setCart(prev => ({ ...prev, total }));
  };

  return {
    cart,
    addToCart,
    removeFromCart,
    clearCart,
    updateCartTotal,
    // Convenience: explicit bin add helper
    addBinToCart: (productId: string, binWeight: number, unitPriceCents: number) => addToCart(productId, 1, { binWeight, unitPriceCents }),
  };
}