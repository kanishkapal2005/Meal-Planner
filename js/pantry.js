/**
 * pantry.js - Pantry inventory tracking, expiry maths, and 'Use It Up' engine
 * Pantry Meal Planner & Grocery Consolidator
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PantryModule = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Helper to format ISO date YYYY-MM-DD offset from today
  function offsetDate(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  // Realistic starter pantry items with staggered expiry dates
  const DEFAULT_STARTER_PANTRY = [
    {
      id: 'pantry-1',
      name: 'baby spinach',
      quantity: 100,
      unit: 'g',
      aisle: 'Produce',
      expiryDate: offsetDate(1), // Expiring tomorrow!
      notes: 'Opened bag'
    },
    {
      id: 'pantry-2',
      name: 'milk',
      quantity: 500,
      unit: 'ml',
      aisle: 'Dairy & Eggs',
      expiryDate: offsetDate(2), // Expiring in 2 days!
      notes: 'Whole milk'
    },
    {
      id: 'pantry-3',
      name: 'heavy cream',
      quantity: 150,
      unit: 'ml',
      aisle: 'Dairy & Eggs',
      expiryDate: offsetDate(3), // Expiring in 3 days!
      notes: 'Leftover from pasta'
    },
    {
      id: 'pantry-4',
      name: 'bell pepper',
      quantity: 2,
      unit: 'piece',
      aisle: 'Produce',
      expiryDate: offsetDate(3),
      notes: 'Red bell pepper'
    },
    {
      id: 'pantry-5',
      name: 'chicken breast',
      quantity: 300,
      unit: 'g',
      aisle: 'Meat & Seafood',
      expiryDate: offsetDate(2),
      notes: 'Thawed'
    },
    {
      id: 'pantry-6',
      name: 'penne pasta',
      quantity: 500,
      unit: 'g',
      aisle: 'Pantry & Grains',
      expiryDate: offsetDate(120),
      notes: 'Unopened box'
    },
    {
      id: 'pantry-7',
      name: 'olive oil',
      quantity: 500,
      unit: 'ml',
      aisle: 'Pantry & Grains',
      expiryDate: offsetDate(180),
      notes: 'Extra virgin'
    },
    {
      id: 'pantry-8',
      name: 'garlic',
      quantity: 6,
      unit: 'cloves',
      aisle: 'Produce',
      expiryDate: offsetDate(14),
      notes: 'Fresh bulb'
    },
    {
      id: 'pantry-9',
      name: 'chickpeas',
      quantity: 2,
      unit: 'can',
      aisle: 'Canned & Jarred',
      expiryDate: offsetDate(300),
      notes: 'Organic'
    },
    {
      id: 'pantry-10',
      name: 'parmesan cheese',
      quantity: 30,
      unit: 'g',
      aisle: 'Dairy & Eggs',
      expiryDate: offsetDate(7),
      notes: 'Wedge'
    }
  ];

  let currentHouseholdId = 'household-default';
  let pantryItems = [];
  let undoStack = [];

  /**
   * Get storage key for household pantry
   */
  function getStorageKey(householdId) {
    return `pmp_v1_pantry_${householdId || currentHouseholdId}`;
  }

  /**
   * Load pantry items from LocalStorage or seed default starter
   */
  function init(householdId) {
    currentHouseholdId = householdId || 'household-default';
    const key = getStorageKey(currentHouseholdId);
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        pantryItems = JSON.parse(stored);
      } else {
        // Seed default starter pantry
        pantryItems = JSON.parse(JSON.stringify(DEFAULT_STARTER_PANTRY));
        save();
      }
    } catch (e) {
      console.warn('LocalStorage error reading pantry:', e);
      pantryItems = JSON.parse(JSON.stringify(DEFAULT_STARTER_PANTRY));
    }
    return pantryItems;
  }

  /**
   * Save current pantry to LocalStorage
   */
  function save() {
    try {
      const key = getStorageKey(currentHouseholdId);
      localStorage.setItem(key, JSON.stringify(pantryItems));
    } catch (e) {
      console.error('Failed to save pantry items:', e);
    }
  }

  /**
   * Get all items in the current pantry
   */
  function getItems() {
    return pantryItems;
  }

  /**
   * Add a new item to the pantry
   */
  function addItem(item) {
    const newItem = {
      id: 'pantry-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      name: (item.name || '').trim().toLowerCase(),
      quantity: Math.max(0, parseFloat(item.quantity) || 1),
      unit: (item.unit || 'piece').trim().toLowerCase(),
      aisle: item.aisle || 'Other',
      expiryDate: item.expiryDate || null,
      notes: (item.notes || '').trim(),
      addedAt: new Date().toISOString()
    };

    pantryItems.push(newItem);
    save();
    return newItem;
  }

  /**
   * Update an existing pantry item
   */
  function updateItem(id, updates) {
    const idx = pantryItems.findIndex(i => i.id === id);
    if (idx !== -1) {
      pantryItems[idx] = { ...pantryItems[idx], ...updates };
      save();
      return pantryItems[idx];
    }
    return null;
  }

  /**
   * Adjust quantity by delta (+1 or -1)
   */
  function adjustQuantity(id, delta) {
    const item = pantryItems.find(i => i.id === id);
    if (item) {
      item.quantity = Math.max(0, Math.round((item.quantity + delta) * 100) / 100);
      save();
      return item;
    }
    return null;
  }

  /**
   * Delete an item from pantry with undo recording
   */
  function deleteItem(id) {
    const idx = pantryItems.findIndex(i => i.id === id);
    if (idx !== -1) {
      const [removed] = pantryItems.splice(idx, 1);
      undoStack.push({ type: 'delete_pantry', item: removed, index: idx });
      save();
      return removed;
    }
    return null;
  }

  /**
   * Undo last deleted item
   */
  function undo() {
    const lastAction = undoStack.pop();
    if (!lastAction) return null;

    if (lastAction.type === 'delete_pantry') {
      pantryItems.splice(lastAction.index, 0, lastAction.item);
      save();
      return lastAction.item;
    }
    return null;
  }

  /**
   * Calculates days remaining until expiry:
   * Returns { days: number|null, status: 'staple'|'expired'|'soon'|'fresh', label: string, class: string }
   */
  function getExpiryStatus(expiryDateStr) {
    if (!expiryDateStr) {
      return {
        days: null,
        status: 'staple',
        label: 'Staple / Long-life',
        chipClass: 'chip-staple',
        icon: '🏷️'
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiry = new Date(expiryDateStr);
    expiry.setHours(0, 0, 0, 0);

    const diffTime = expiry - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      const pastDays = Math.abs(diffDays);
      return {
        days: diffDays,
        status: 'expired',
        label: pastDays === 1 ? 'Expired yesterday' : `Expired ${pastDays}d ago`,
        chipClass: 'chip-expired',
        icon: '⚠️'
      };
    }

    if (diffDays === 0) {
      return {
        days: 0,
        status: 'soon',
        label: 'Expires today!',
        chipClass: 'chip-soon-urgent',
        icon: '⏳'
      };
    }

    if (diffDays === 1) {
      return {
        days: 1,
        status: 'soon',
        label: 'Expires tomorrow',
        chipClass: 'chip-soon',
        icon: '⏳'
      };
    }

    if (diffDays <= 4) {
      return {
        days: diffDays,
        status: 'soon',
        label: `${diffDays} days left`,
        chipClass: 'chip-soon',
        icon: '⏳'
      };
    }

    return {
      days: diffDays,
      status: 'fresh',
      label: `${diffDays} days left`,
      chipClass: 'chip-fresh',
      icon: '🌿'
    };
  }

  /**
   * Find matching pantry item for a recipe ingredient name
   */
  function findPantryMatch(ingredientName) {
    if (!ingredientName) return null;
    const search = ingredientName.trim().toLowerCase();

    // Exact name match
    let match = pantryItems.find(p => p.name === search);
    if (match) return match;

    // Substring or singular/plural match
    match = pantryItems.find(p => {
      const pName = p.name.toLowerCase();
      return pName.includes(search) || search.includes(pName);
    });

    return match || null;
  }

  /**
   * 'Use It Up' Suggestions Engine:
   * Analyzes all recipes in library and ranks them by how many soon-to-expire
   * items in the pantry they help utilize.
   */
  function getUseItUpSuggestions(recipes) {
    if (!recipes || !recipes.length) return [];

    // Find soon-to-expire and expired pantry items (<= 5 days)
    const expiringPantryItems = pantryItems.filter(item => {
      const status = getExpiryStatus(item.expiryDate);
      return status.status === 'expired' || status.status === 'soon';
    });

    if (!expiringPantryItems.length) {
      // If no items are strictly expiring soon, take items with soonest expiry
      const datedItems = pantryItems
        .filter(item => item.expiryDate)
        .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate))
        .slice(0, 3);
      if (!datedItems.length) return [];
      expiringPantryItems.push(...datedItems);
    }

    const suggestions = [];

    recipes.forEach(recipe => {
      const matchedItems = [];
      let score = 0;

      recipe.ingredients.forEach(ing => {
        const ingName = (ing.name || ing.raw || '').toLowerCase();

        expiringPantryItems.forEach(pItem => {
          const pName = pItem.name.toLowerCase();
          if (pName.includes(ingName) || ingName.includes(pName)) {
            const expStatus = getExpiryStatus(pItem.expiryDate);
            // Higher weight for urgent items
            const urgencyWeight = expStatus.days <= 1 ? 3 : (expStatus.days <= 3 ? 2 : 1);
            score += urgencyWeight;

            if (!matchedItems.some(m => m.id === pItem.id)) {
              matchedItems.push({
                id: pItem.id,
                name: pItem.name,
                daysLeft: expStatus.days,
                label: expStatus.label,
                urgencyWeight
              });
            }
          }
        });
      });

      if (matchedItems.length > 0) {
        suggestions.push({
          recipe,
          score,
          matchedCount: matchedItems.length,
          matchedItems: matchedItems,
          percentUsed: Math.round((matchedItems.length / recipe.ingredients.length) * 100)
        });
      }
    });

    // Sort descending by score, then by matchedCount
    suggestions.sort((a, b) => b.score - a.score || b.matchedCount - a.matchedCount);

    return suggestions;
  }

  return {
    init,
    save,
    getItems,
    addItem,
    updateItem,
    adjustQuantity,
    deleteItem,
    undo,
    getExpiryStatus,
    findPantryMatch,
    getUseItUpSuggestions,
    offsetDate,
    setHousehold: (id) => init(id)
  };
});
