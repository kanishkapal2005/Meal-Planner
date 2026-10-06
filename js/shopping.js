/**
 * shopping.js - Consolidated grocery list, pantry subtraction, and aisle grouping
 * Pantry Meal Planner & Grocery Consolidator
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ShoppingModule = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  let customItems = [];
  let checkedItems = {}; // Map of itemKey -> boolean
  let currentHouseholdId = 'household-default';

  function getStorageKey(householdId) {
    return `pmp_v1_shopping_${householdId || currentHouseholdId}`;
  }

  function init(householdId) {
    currentHouseholdId = householdId || 'household-default';
    try {
      const stored = localStorage.getItem(getStorageKey(currentHouseholdId));
      if (stored) {
        const parsed = JSON.parse(stored);
        customItems = parsed.customItems || [];
        checkedItems = parsed.checkedItems || {};
      } else {
        customItems = [];
        checkedItems = {};
      }
    } catch (e) {
      console.warn('LocalStorage error reading shopping list:', e);
      customItems = [];
      checkedItems = {};
    }
  }

  function save() {
    try {
      const data = { customItems, checkedItems };
      localStorage.setItem(getStorageKey(currentHouseholdId), JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save shopping list state:', e);
    }
  }

  /**
   * Add a custom item to the shopping list (not tied to any recipe)
   */
  function addCustomItem(name, quantity, unit, aisle) {
    const item = {
      id: 'custom-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      name: (name || '').trim().toLowerCase(),
      quantity: parseFloat(quantity) || 1,
      unit: (unit || 'piece').trim().toLowerCase(),
      aisle: aisle || 'Other',
      isCustom: true,
      addedAt: new Date().toISOString()
    };
    customItems.push(item);
    save();
    return item;
  }

  /**
   * Remove a custom item
   */
  function removeCustomItem(id) {
    const idx = customItems.findIndex(i => i.id === id);
    if (idx !== -1) {
      customItems.splice(idx, 1);
      save();
      return true;
    }
    return false;
  }

  /**
   * Toggle checked state of an item
   */
  function toggleChecked(itemKey) {
    checkedItems[itemKey] = !checkedItems[itemKey];
    save();
    return checkedItems[itemKey];
  }

  /**
   * Check or uncheck all items
   */
  function setAllChecked(items, isChecked) {
    items.forEach(item => {
      checkedItems[item.key] = isChecked;
    });
    save();
  }

  /**
   * Clear all checked items
   */
  function clearChecked() {
    checkedItems = {};
    save();
  }

  /**
   * Generate consolidated shopping list from weekly plan, pantry stock, and custom items
   */
  function generateList(plannerModule, pantryModule, unitsModule) {
    const weeklyPlan = plannerModule.getPlan();
    const days = plannerModule.DAYS;
    const slots = plannerModule.SLOTS;
    const dayLabels = plannerModule.DAY_LABELS;
    const slotLabels = plannerModule.SLOT_LABELS;

    // Map: canonicalName -> Consolidated item
    const rawMap = new Map();

    // 1. Gather all recipe ingredients from active schedule
    days.forEach(day => {
      slots.forEach(slot => {
        const meals = weeklyPlan[day]?.[slot] || [];
        meals.forEach(meal => {
          // Leftover meals DO NOT buy ingredients again! They are cooked in the source meal.
          if (meal.isLeftover) return;

          const recipe = meal.sourceRecipe;
          if (!recipe || !recipe.ingredients) return;

          // Scale factor
          const scale = (meal.servings || 1) / (meal.baseServings || recipe.servings || 1);
          const mealContext = `${dayLabels[day].substring(0, 3)} ${slotLabels[slot]} (${recipe.name})`;

          recipe.ingredients.forEach(ing => {
            const ingName = (ing.name || ing.raw || '').trim().toLowerCase();
            const ingQty = (parseFloat(ing.quantity) || 1) * scale;
            const ingUnit = (ing.unit || 'piece').trim().toLowerCase();
            const aisle = ing.aisle || unitsModule.getConfig().aisles?.[0] || 'Produce';

            // Key by normalized name and unit dimension to allow compatible unit merges
            const dimension = unitsModule.getUnitDimension(ingUnit);
            const itemKey = `${ingName}__${dimension}`;

            if (!rawMap.has(itemKey)) {
              rawMap.set(itemKey, {
                key: itemKey,
                name: ingName,
                dimension: dimension,
                aisle: aisle,
                baseQty: 0,
                baseUnit: '',
                originalUnits: [ingUnit],
                reasons: [],
                isCustom: false
              });
            }

            const itemRecord = rawMap.get(itemKey);
            // Convert to base units and accumulate
            const baseObj = unitsModule.toBase(ingQty, ingUnit);
            itemRecord.baseQty += baseObj.baseQty;
            itemRecord.baseUnit = baseObj.baseUnit;
            if (!itemRecord.originalUnits.includes(ingUnit)) {
              itemRecord.originalUnits.push(ingUnit);
            }

            // Record reason for shopping
            const reasonStr = `${mealContext} [${unitsModule.formatQuantityUnit(ingQty, ingUnit)}]`;
            if (!itemRecord.reasons.includes(reasonStr)) {
              itemRecord.reasons.push(reasonStr);
            }
          });
        });
      });
    });

    // 2. Add custom ad-hoc grocery items
    customItems.forEach(custom => {
      const dimension = unitsModule.getUnitDimension(custom.unit);
      const itemKey = `custom_${custom.id}`;
      const baseObj = unitsModule.toBase(custom.quantity, custom.unit);

      rawMap.set(itemKey, {
        key: itemKey,
        name: custom.name,
        dimension: dimension,
        aisle: custom.aisle,
        baseQty: baseObj.baseQty,
        baseUnit: baseObj.baseUnit,
        originalUnits: [custom.unit],
        reasons: ['Ad-hoc pantry request'],
        isCustom: true,
        customId: custom.id
      });
    });

    // 3. Process pantry offsets and calculate net grocery requirements
    const consolidatedList = [];

    rawMap.forEach((rec, key) => {
      const preferredUnit = rec.originalUnits[0] || rec.baseUnit;
      // Friendly formatted total needed
      const neededFormatted = unitsModule.fromBase(rec.baseQty, rec.dimension, preferredUnit);

      // Check if pantry has this item
      let pantryStock = null;
      let netResult = {
        netQuantity: neededFormatted.quantity,
        netUnit: neededFormatted.unit,
        fullyCovered: false,
        pantryUsed: 0
      };

      if (!rec.isCustom) {
        pantryStock = pantryModule.findPantryMatch(rec.name);
        if (pantryStock && pantryStock.quantity > 0) {
          netResult = unitsModule.subtractPantry(
            neededFormatted.quantity,
            neededFormatted.unit,
            pantryStock.quantity,
            pantryStock.unit
          );
        }
      }

      const isChecked = !!checkedItems[key];

      consolidatedList.push({
        key: key,
        name: rec.name,
        aisle: rec.aisle,
        dimension: rec.dimension,
        totalNeededQty: neededFormatted.quantity,
        totalNeededUnit: neededFormatted.unit,
        toBuyQty: netResult.netQuantity,
        toBuyUnit: netResult.netUnit,
        fullyCovered: netResult.fullyCovered,
        pantryMatch: pantryStock,
        pantryQty: pantryStock ? pantryStock.quantity : 0,
        pantryUnit: pantryStock ? pantryStock.unit : '',
        reasons: rec.reasons,
        isCustom: rec.isCustom,
        customId: rec.customId,
        isChecked: isChecked
      });
    });

    // Sort by aisle order, then name
    const aislesOrder = unitsModule.getConfig().aisles || [];
    consolidatedList.sort((a, b) => {
      const idxA = aislesOrder.indexOf(a.aisle);
      const idxB = aislesOrder.indexOf(b.aisle);
      const safeIdxA = idxA === -1 ? 999 : idxA;
      const safeIdxB = idxB === -1 ? 999 : idxB;
      if (safeIdxA !== safeIdxB) return safeIdxA - safeIdxB;
      return a.name.localeCompare(b.name);
    });

    return consolidatedList;
  }

  /**
   * Group consolidated list items by aisle
   */
  function groupByAisle(list) {
    const groups = {};
    list.forEach(item => {
      const aisle = item.aisle || 'Other';
      if (!groups[aisle]) {
        groups[aisle] = [];
      }
      groups[aisle].push(item);
    });
    return groups;
  }

  /**
   * Formats shopping list into a crisp plain-text checklist for WhatsApp, Notes, SMS
   */
  function formatAsPlainText(list, unitsModule) {
    if (!list || !list.length) {
      return '🛒 Shopping List is empty! Plan some meals first.';
    }

    const groups = groupByAisle(list.filter(i => !i.fullyCovered));
    let text = `🛒 PANTRY MEAL PLANNER - GROCERY LIST\nGenerated: ${new Date().toLocaleDateString()}\n\n`;

    let totalItems = 0;
    for (const [aisle, items] of Object.entries(groups)) {
      if (!items.length) continue;
      text += `📍 ${aisle.toUpperCase()}\n`;
      items.forEach(item => {
        totalItems++;
        const check = item.isChecked ? '[x]' : '[ ]';
        const qtyStr = unitsModule.formatQuantityUnit(item.toBuyQty, item.toBuyUnit);
        text += `${check} ${qtyStr} ${item.name}`;
        if (item.pantryMatch && item.pantryQty > 0) {
          const pantryStr = unitsModule.formatQuantityUnit(item.pantryQty, item.pantryUnit);
          text += ` (has ${pantryStr} in pantry)`;
        }
        text += '\n';
      });
      text += '\n';
    }

    // Add pantry-covered section if any
    const covered = list.filter(i => i.fullyCovered);
    if (covered.length > 0) {
      text += `✅ FULLY COVERED BY PANTRY (${covered.length} items):\n`;
      covered.forEach(item => {
        text += `• ${item.name} (${unitsModule.formatQuantityUnit(item.totalNeededQty, item.totalNeededUnit)})\n`;
      });
    }

    return text.trim();
  }

  /**
   * Share shopping list using Web Share API with clipboard fallback
   */
  async function shareList(plainText) {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Grocery Shopping List',
          text: plainText
        });
        return { success: true, method: 'share' };
      } catch (err) {
        if (err.name === 'AbortError') return { success: false, aborted: true };
        console.warn('Web Share failed, attempting clipboard copy:', err);
      }
    }

    // Clipboard fallback
    try {
      await navigator.clipboard.writeText(plainText);
      return { success: true, method: 'clipboard' };
    } catch (e) {
      // Last-ditch textarea execCommand fallback
      const textArea = document.createElement('textarea');
      textArea.value = plainText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return { success: true, method: 'clipboard' };
    }
  }

  return {
    init,
    save,
    addCustomItem,
    removeCustomItem,
    toggleChecked,
    setAllChecked,
    clearChecked,
    generateList,
    groupByAisle,
    formatAsPlainText,
    shareList,
    setHousehold: (id) => init(id)
  };
});
