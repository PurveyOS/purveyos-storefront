import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import toast from 'react-hot-toast';

interface BoxItem {
  id: string;
  subscription_product_id: string;
  product_id: string;
  substitution_group: string | null;
  is_substitution_option: boolean;
  substitution_group_units_allowed: number | null;
  default_quantity: number;
  is_optional: boolean;
  display_order: number;
}

interface GroupChoice {
  productId: string;
  quantity: number;
}

interface SubscriptionBoxSelectorProps {
  subscriptionProductId: string;
  primaryColor?: string;
  onSelectionChange: (substitutions: Record<string, GroupChoice[]>) => void;
}

export function SubscriptionBoxSelector({
  subscriptionProductId,
  primaryColor = '#0f6fff',
  onSelectionChange,
}: SubscriptionBoxSelectorProps) {
  const [boxItems, setBoxItems] = useState<BoxItem[]>([]);
  const [substitutions, setSubstitutions] = useState<Record<string, GroupChoice[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Load subscription box items on mount
  useEffect(() => {
    const loadBoxItems = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('subscription_box_items')
          .select(
            'id, subscription_product_id, product_id, substitution_group, is_substitution_option, substitution_group_units_allowed, default_quantity, is_optional, display_order'
          )
          .eq('subscription_product_id', subscriptionProductId)
          .order('display_order', { ascending: true });

        if (error) {
          console.error('Error loading box items:', error);
          toast.error('Failed to load subscription box options');
          return;
        }

        if (data) {
          setBoxItems(data);
          // Initialize substitutions for groups
          initializeSubstitutions(data);
        }
      } catch (err) {
        console.error('Unexpected error loading box items:', err);
        toast.error('Failed to load subscription options');
      } finally {
        setLoading(false);
      }
    };

    if (subscriptionProductId) {
      loadBoxItems();
    }
  }, [subscriptionProductId]);

  // Initialize substitutions object with empty arrays for each group
  const initializeSubstitutions = (items: BoxItem[]) => {
    const groups = new Set<string>();
    for (const item of items) {
      if (item.substitution_group) {
        groups.add(item.substitution_group);
      }
    }

    const newSubs: Record<string, GroupChoice[]> = {};
    for (const group of groups) {
      newSubs[group] = [];
    }
    setSubstitutions(newSubs);
  };

  // Group items by substitution_group
  const groupedItems = React.useMemo(() => {
    const groups: Record<string, BoxItem[]> = {};

    for (const item of boxItems) {
      if (item.substitution_group) {
        if (!groups[item.substitution_group]) {
          groups[item.substitution_group] = [];
        }
        groups[item.substitution_group].push(item);
      }
    }

    return groups;
  }, [boxItems]);

  // Toggle a product in a group and update quantity
  const handleToggleProduct = (
    groupName: string,
    productId: string,
    checked: boolean
  ) => {
    setSubstitutions((prev) => {
      const updated = { ...prev };
      if (!updated[groupName]) {
        updated[groupName] = [];
      }

      if (checked) {
        // Add product with default quantity of 1
        if (!updated[groupName].find((c) => c.productId === productId)) {
          updated[groupName].push({ productId, quantity: 1 });
        }
      } else {
        // Remove product
        updated[groupName] = updated[groupName].filter((c) => c.productId !== productId);
      }

      validateGroup(groupName, updated[groupName]);
      onSelectionChange(updated);
      return updated;
    });
  };

  // Update quantity for a chosen product
  const handleQuantityChange = (
    groupName: string,
    productId: string,
    quantity: number
  ) => {
    setSubstitutions((prev) => {
      const updated = { ...prev };
      const choice = updated[groupName]?.find((c) => c.productId === productId);
      if (choice) {
        choice.quantity = Math.max(0.1, quantity); // Min 0.1
      }

      validateGroup(groupName, updated[groupName]);
      onSelectionChange(updated);
      return updated;
    });
  };

  // Validate group total vs allowed units
  const validateGroup = (groupName: string, choices: GroupChoice[]) => {
    const baseItem = boxItems.find(
      (item) =>
        item.substitution_group === groupName && !item.is_substitution_option
    );

    if (!baseItem) return;

    const total = choices.reduce((sum, c) => sum + c.quantity, 0);
    const allowed = baseItem.substitution_group_units_allowed || 1;

    setErrors((prev) => {
      const updated = { ...prev };
      if (total > allowed) {
        updated[groupName] = `Total units (${total.toFixed(2)}) exceeds allowed (${allowed})`;
      } else {
        delete updated[groupName];
      }
      return updated;
    });
  };

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div 
          className="animate-spin rounded-full h-6 w-6 border-b-2 mx-auto"
          style={{ borderColor: primaryColor }}
        ></div>
      </div>
    );
  }

  if (Object.keys(groupedItems).length === 0) {
    return <div className="p-4 text-gray-600">No customization options available for this box.</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Customize Your Box
        </h3>
        <p className="text-sm text-gray-600">
          Select your preferred products for each group. You can mix and match up to the allowed units per group.
        </p>
      </div>

      {Object.entries(groupedItems).map(([groupName, options]) => {
        const baseItem = boxItems.find(
          (item) =>
            item.substitution_group === groupName && !item.is_substitution_option
        );
        const allowed = baseItem?.substitution_group_units_allowed || 1;
        const currentChoices = substitutions[groupName] || [];
        const currentTotal = currentChoices.reduce((sum, c) => sum + c.quantity, 0);
        const isOverLimit = currentTotal > allowed;

        return (
          <div
            key={groupName}
            className={`border rounded-lg p-4 ${
              errors[groupName] ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'
            }`}
          >
            <div className="mb-4">
              <h4 className="font-semibold text-gray-900">{groupName}</h4>
              <p className="text-xs text-gray-600">
                Select up to <strong>{allowed}</strong> units
                {currentChoices.length > 0 && (
                  <span className={isOverLimit ? 'text-red-600 ml-2' : 'text-green-600 ml-2'}>
                    (Current: {currentTotal.toFixed(2)})
                  </span>
                )}
              </p>
              {errors[groupName] && (
                <p className="text-red-600 text-xs mt-2">{errors[groupName]}</p>
              )}
            </div>

            <div className="space-y-3">
              {options
                .filter((item) => item.is_substitution_option)
                .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
                .map((option) => {
                  const isSelected = currentChoices.some(
                    (c) => c.productId === option.product_id
                  );
                  const selectedChoice = currentChoices.find(
                    (c) => c.productId === option.product_id
                  );

                  return (
                    <div key={option.id} className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id={option.id}
                        checked={isSelected}
                        onChange={(e) =>
                          handleToggleProduct(
                            groupName,
                            option.product_id,
                            e.target.checked
                          )
                        }
                        className="h-4 w-4 rounded border-gray-300 focus:ring-2"
                        style={{ accentColor: primaryColor }}
                      />
                      <label
                        htmlFor={option.id}
                        className="flex-1 text-sm text-gray-900 font-medium cursor-pointer"
                      >
                        {option.product_id}
                      </label>

                      {isSelected && (
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor={`qty-${option.id}`}
                            className="text-xs text-gray-600"
                          >
                            Qty:
                          </label>
                          <input
                            id={`qty-${option.id}`}
                            type="number"
                            min="0.1"
                            step="0.1"
                            value={selectedChoice?.quantity || 1}
                            onChange={(e) =>
                              handleQuantityChange(
                                groupName,
                                option.product_id,
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-16 px-2 py-1 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-offset-0"
                            style={{ borderColor: primaryColor, outline: 'none' }}
                            onFocus={(e) => (e.target.style.borderColor = primaryColor)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
