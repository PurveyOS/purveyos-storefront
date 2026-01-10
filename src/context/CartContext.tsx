import { createContext, useContext, ReactNode } from 'react';
import { usePersistedCart } from '../hooks/usePersistedCart';

type CartContextType = ReturnType<typeof usePersistedCart>;

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const cart = usePersistedCart();
  
  return (
    <CartContext.Provider value={cart}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within CartProvider');
  }
  return context;
}
