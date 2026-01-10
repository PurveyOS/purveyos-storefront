import { useState, useEffect, useCallback, useRef } from 'react';
import type { Cart } from '../types/storefront';
import { trackAddToCart, trackClearCart, trackRemoveFromCart } from '../utils/analytics';
import toast from 'react-hot-toast';

const CART_STORAGE_KEY = 'purveyos-cart';

export function usePersistedCart() {
  const [cart, setCart] = useState<Cart>({
    items: [],
    total: 0,
  });

  // Track if we've loaded from localStorage
  const hasLoadedRef = useRef(false);

  // Track previous cart size to detect additions/removals
  const prevCartSizeRef = useRef(0);
  const prevItemsRef = useRef<any[]>([]);

  // Load cart from localStorage on mount
  useEffect(() => {
    console.log('🔄 Loading cart from localStorage...');
    const savedCart = localStorage.getItem(CART_STORAGE_KEY);
    console.log('📂 Saved cart:', savedCart);
    if (savedCart) {
      try {
        const parsedCart = JSON.parse(savedCart);
        console.log('✅ Parsed cart:', { itemsCount: parsedCart.items.length, items: parsedCart.items });
        setCart(parsedCart);
        hasLoadedRef.current = true;
      } catch (error) {
        console.error('Error parsing saved cart:', error);
        hasLoadedRef.current = true;
      }
    } else {
      console.log('📭 No saved cart found');
      hasLoadedRef.current = true;
    }
  }, []);

  // Save cart to localStorage whenever it changes (but skip initial empty state)
  useEffect(() => {
    console.log('💾 Save effect triggered:', { hasLoaded: hasLoadedRef.current, itemsCount: cart.items.length });
    if (hasLoadedRef.current) {
      console.log('✅ Saving cart to localStorage:', JSON.stringify(cart));
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } else {
      console.log('⏸️ Skipping save (not loaded yet)');
    }
  }, [cart]);

  // Show toast notifications when cart changes (outside of state setter)
  useEffect(() => {
    const currentSize = cart.items.length;
    const prevSize = prevCartSizeRef.current;

    if (currentSize > prevSize) {
      // Item(s) added
      toast.success('Added to cart');
    } else if (currentSize < prevSize && currentSize > 0) {
      // Item removed but cart not empty
      toast.success('Item removed');
    } else if (currentSize === 0 && prevSize > 0) {
      // Cart cleared
      toast.success('Cart cleared');
    }

    prevCartSizeRef.current = currentSize;
    prevItemsRef.current = cart.items;
  }, [cart.items.length]);

  const addToCart = (productId: string, quantity: number = 1, options?: { binWeight?: number; unitPriceCents?: number; weight?: number; isPreOrder?: boolean; metadata?: any }) => {
    console.log('🛒 addToCart called:', { productId, quantity, options });
    setCart(prev => {
      console.log('📦 Current cart before add:', { itemsCount: prev.items.length, items: prev.items });
      const existingItem = prev.items.find(item => 
        item.productId === productId && 
        item.binWeight === options?.binWeight &&
        item.weight === options?.weight &&
        !options?.metadata?.isSubscription // Don't merge subscription items
      );
      
      if (existingItem) {
        console.log('📦 Item already exists, updating quantity');
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
        return updated;
      }

      console.log('✨ New item, adding to cart');
      const next = {
        ...prev,
        items: [...prev.items, { 
          productId, 
          quantity, 
          binWeight: options?.binWeight, 
          unitPriceCents: options?.unitPriceCents,
          weight: options?.weight,
          isPreOrder: options?.isPreOrder,
          metadata: options?.metadata
        }],
      };
      console.log('✅ New cart after add:', { itemsCount: next.items.length, items: next.items });
      try { trackAddToCart({ productId, quantity, ...options }); } catch {}
      return next;
    });
  };

  const removeFromCart = (productId: string, options?: { binWeight?: number }) => {
    setCart(prev => {
      const existingItem = prev.items.find(item => item.productId === productId && (options?.binWeight === undefined || item.binWeight === options.binWeight));
      
      if (!existingItem) {
        return prev;
      }
      
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
  };

  // Bulk remove specific cart entries, matching on productId and optional binWeight/weight
  const removeItems = (itemsToRemove: Array<{ productId: string; binWeight?: number; weight?: number }>) => {
    if (!Array.isArray(itemsToRemove) || itemsToRemove.length === 0) return;

    setCart(prev => {
      const filtered = prev.items.filter(item => {
        return !itemsToRemove.some(toRemove => {
          if (item.productId !== toRemove.productId) return false;
          if (toRemove.binWeight !== undefined && item.binWeight !== toRemove.binWeight) return false;
          if (toRemove.weight !== undefined && item.weight !== toRemove.weight) return false;
          return true;
        });
      });

      // Fire analytics for removals (non-blocking)
      itemsToRemove.forEach((r) => {
        try { trackRemoveFromCart({ productId: r.productId, quantity: 1, binWeight: r.binWeight }); } catch {}
      });

      return { ...prev, items: filtered };
    });
  };

  // Stable updater to avoid effect churn in consumers
  const updateCartTotal = useCallback((products: any[]) => {
    setCart(prev => {
      const total = prev.items.reduce((sum, item) => {
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

      return { ...prev, total };
    });
  }, []);

  return {
    cart,
    addToCart,
    removeFromCart,
    clearCart,
    updateCartTotal,
    removeItems,
    // Convenience: explicit bin add helper
    addBinToCart: (productId: string, binWeight: number, unitPriceCents: number) => addToCart(productId, 1, { binWeight, unitPriceCents }),
  };
}