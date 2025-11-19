
interface TemplateSwitcherProps {
  currentTemplate: string; // "modern" | "classic" | "minimal"
  onTemplateChange: (template: string) => void;
}

const TEMPLATE_SEQUENCE = ["modern", "minimal", "classic"] as const;

export function TemplateSwitcher({
  currentTemplate,
  onTemplateChange,
}: TemplateSwitcherProps) {
  // 🔥 Hide Template Switcher in production environments
  if (
    typeof window !== "undefined" &&
    (window.location.hostname.endsWith("purveyos.store") ||
      window.location.hostname.includes("vercel.app") ||
      window.location.hostname.includes("cloudflare"))
  ) {
    return null;
  }

  // Find the next template in the cycle
  const currentIndex = TEMPLATE_SEQUENCE.indexOf(
    currentTemplate as (typeof TEMPLATE_SEQUENCE)[number]
  );
  const nextTemplate =
    currentIndex === -1
      ? "modern"
      : TEMPLATE_SEQUENCE[(currentIndex + 1) % TEMPLATE_SEQUENCE.length];

  const labelMap: Record<string, string> = {
    modern: "Modern",
    classic: "Classic",
    minimal: "Minimal",
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={() => onTemplateChange(nextTemplate)}
        className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg rounded-full px-4 py-2 text-sm font-medium flex items-center gap-2 transition"
        title="Cycle storefront template (dev only)"
      >
        🖥️
        <span>
          {labelMap[currentTemplate] || "Modern"} → {labelMap[nextTemplate]}
        </span>
      </button>
    </div>
  );
}
