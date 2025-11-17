declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Record<string, any> }) => void;
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
    fbq?: (...args: any[]) => void;
    posthog?: {
      capture: (event: string, props?: Record<string, any>) => void;
      identify?: (id: string, props?: Record<string, any>) => void;
    };
  }
}

export {};
