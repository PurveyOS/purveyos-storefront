import { ClassicTemplate } from './ClassicTemplate';
import { MinimalTemplate } from './MinimalTemplate';
import { ModernFarmTemplate } from './ModernFarmTemplate';
import type { StorefrontTemplateProps } from '../types/storefront';

export const TEMPLATE_REGISTRY: Record<string, React.FC<StorefrontTemplateProps>> = {
  classic: ClassicTemplate,
  minimal: MinimalTemplate,
  modern: ModernFarmTemplate,
};

export function getTemplate(templateId: string): React.FC<StorefrontTemplateProps> {
  return TEMPLATE_REGISTRY[templateId] || ClassicTemplate;
}