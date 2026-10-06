/**
 * units.js - Unit conversions, fraction formatting, and consolidation math
 * Pantry Meal Planner & Grocery Consolidator
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.UnitsModule = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Fallback units config in case data/units.json cannot be fetched (e.g. file:// protocol)
  const DEFAULT_UNITS_CONFIG = {
    volume: {
      base: 'ml',
      conversions: {
        'ml': 1, 'milliliter': 1, 'milliliters': 1,
        'l': 1000, 'liter': 1000, 'liters': 1000,
        'tsp': 5, 'teaspoon': 5, 'teaspoons': 5,
        'tbsp': 15, 'tablespoon': 15, 'tablespoons': 15,
        'fl oz': 29.57, 'fluid ounce': 29.57, 'fluid ounces': 29.57,
        'cup': 240, 'cups': 240,
        'pint': 473.18, 'pints': 473.18, 'pt': 473.18,
        'quart': 946.35, 'quarts': 946.35, 'qt': 946.35,
        'gallon': 3785.41, 'gallons': 3785.41, 'gal': 3785.41
      }
    },
    mass: {
      base: 'g',
      conversions: {
        'g': 1, 'gram': 1, 'grams': 1,
        'kg': 1000, 'kilogram': 1000, 'kilograms': 1000,
        'oz': 28.35, 'ounce': 28.35, 'ounces': 28.35,
        'lb': 453.59, 'lbs': 453.59, 'pound': 453.59, 'pounds': 453.59
      }
    },
    count: {
      base: 'count',
      units: [
        'clove', 'cloves', 'piece', 'pieces', 'slice', 'slices',
        'can', 'cans', 'bunch', 'bunches', 'pinch', 'pinches',
        'dash', 'dashes', 'stalk', 'stalks', 'head', 'heads',
        'leaf', 'leaves', 'egg', 'eggs', 'package', 'packages',
        'pack', 'packs', 'bag', 'bags', 'bottle', 'bottles',
        'jar', 'jars', 'count', 'item', 'items'
      ]
    },
    aisles: [
      'Produce',
      'Dairy & Eggs',
      'Meat & Seafood',
      'Bakery',
      'Pantry & Grains',
      'Canned & Jarred',
      'Condiments & Spices',
      'Frozen',
      'Snacks & Beverages',
      'Other'
    ],
    densities: {
      'water': 1.0,
      'milk': 1.03,
      'olive oil': 0.92,
      'vegetable oil': 0.92,
      'all-purpose flour': 0.53,
      'flour': 0.53,
      'granulated sugar': 0.85,
      'sugar': 0.85,
      'brown sugar': 0.82,
      'honey': 1.42,
      'butter': 0.96,
      'rice': 0.85,
      'oats': 0.40,
      'soy sauce': 1.15
    }
  };

  let unitsConfig = DEFAULT_UNITS_CONFIG;

  /**
   * Load units configuration from JSON or fallback
   */
  async function loadConfig() {
    try {
      const res = await fetch('data/units.json');
      if (res.ok) {
        unitsConfig = await res.json();
      }
    } catch (e) {
      console.warn('Could not fetch data/units.json, using fallback unit conversions:', e);
      unitsConfig = DEFAULT_UNITS_CONFIG;
    }
    return unitsConfig;
  }

  /**
   * Normalizes a unit string to lowercase singular or canonical form
   */
  function canonicalizeUnit(unit) {
    if (!unit) return 'count';
    const clean = unit.trim().toLowerCase();
    
    // Check volume
    if (clean === 'ml' || clean === 'milliliter' || clean === 'milliliters') return 'ml';
    if (clean === 'l' || clean === 'liter' || clean === 'liters') return 'l';
    if (clean === 'tsp' || clean === 'teaspoon' || clean === 'teaspoons') return 'tsp';
    if (clean === 'tbsp' || clean === 'tablespoon' || clean === 'tablespoons' || clean === 'tbs' || clean === 'tb') return 'tbsp';
    if (clean === 'c' || clean === 'cup' || clean === 'cups') return 'cup';
    if (clean === 'fl oz' || clean === 'fluid ounce' || clean === 'fluid ounces') return 'fl oz';
    if (clean === 'pint' || clean === 'pints' || clean === 'pt') return 'pint';
    if (clean === 'quart' || clean === 'quarts' || clean === 'qt') return 'quart';
    if (clean === 'gallon' || clean === 'gallons' || clean === 'gal') return 'gallon';

    // Check mass
    if (clean === 'g' || clean === 'gram' || clean === 'grams') return 'g';
    if (clean === 'kg' || clean === 'kilogram' || clean === 'kilograms') return 'kg';
    if (clean === 'oz' || clean === 'ounce' || clean === 'ounces') return 'oz';
    if (clean === 'lb' || clean === 'lbs' || clean === 'pound' || clean === 'pounds') return 'lb';

    // Check discrete units
    if (clean === 'clove' || clean === 'cloves') return 'cloves';
    if (clean === 'piece' || clean === 'pieces' || clean === 'item' || clean === 'items') return 'piece';
    if (clean === 'slice' || clean === 'slices') return 'slice';
    if (clean === 'can' || clean === 'cans') return 'can';
    if (clean === 'bunch' || clean === 'bunches') return 'bunch';
    if (clean === 'pinch' || clean === 'pinches') return 'pinch';
    if (clean === 'dash' || clean === 'dashes') return 'dash';
    if (clean === 'stalk' || clean === 'stalks') return 'stalk';
    if (clean === 'head' || clean === 'heads') return 'head';
    if (clean === 'leaf' || clean === 'leaves') return 'leaves';
    if (clean === 'egg' || clean === 'eggs') return 'eggs';
    if (clean === 'pack' || clean === 'package' || clean === 'packages' || clean === 'packs') return 'pack';
    if (clean === 'bag' || clean === 'bags') return 'bag';
    if (clean === 'bottle' || clean === 'bottles') return 'bottle';
    if (clean === 'jar' || clean === 'jars') return 'jar';

    return clean;
  }

  /**
   * Determine the dimension type of a unit ('volume', 'mass', or 'count')
   */
  function getUnitDimension(unit) {
    const cUnit = canonicalizeUnit(unit);
    if (unitsConfig.volume.conversions[cUnit]) return 'volume';
    if (unitsConfig.mass.conversions[cUnit]) return 'mass';
    return 'count';
  }

  /**
   * Converts a given quantity + unit to its base unit representation.
   * Returns { baseQty, baseUnit, dimension }
   */
  function toBase(qty, unit) {
    const canonical = canonicalizeUnit(unit);
    const dimension = getUnitDimension(canonical);

    if (dimension === 'volume') {
      const factor = unitsConfig.volume.conversions[canonical] || 1;
      return { baseQty: qty * factor, baseUnit: unitsConfig.volume.base, dimension: 'volume' };
    }
    if (dimension === 'mass') {
      const factor = unitsConfig.mass.conversions[canonical] || 1;
      return { baseQty: qty * factor, baseUnit: unitsConfig.mass.base, dimension: 'mass' };
    }
    return { baseQty: qty, baseUnit: canonical, dimension: 'count' };
  }

  /**
   * Given a base quantity and dimension, formats into the most friendly human-readable unit
   */
  function fromBase(baseQty, dimension, preferredUnit) {
    if (dimension === 'volume') {
      // If user preferred unit is valid volume unit, try to respect it if reasonable
      if (preferredUnit && unitsConfig.volume.conversions[canonicalizeUnit(preferredUnit)]) {
        const factor = unitsConfig.volume.conversions[canonicalizeUnit(preferredUnit)];
        return { quantity: baseQty / factor, unit: preferredUnit };
      }
      // Smart display rule:
      if (baseQty >= 1000) {
        const liters = baseQty / 1000;
        return { quantity: liters, unit: 'L' };
      }
      if (baseQty >= 120) {
        const cups = baseQty / 240;
        return { quantity: cups, unit: 'cup' };
      }
      if (baseQty >= 15) {
        const tbsp = baseQty / 15;
        return { quantity: tbsp, unit: 'tbsp' };
      }
      if (baseQty >= 5) {
        const tsp = baseQty / 5;
        return { quantity: tsp, unit: 'tsp' };
      }
      return { quantity: baseQty, unit: 'ml' };
    }

    if (dimension === 'mass') {
      if (preferredUnit && unitsConfig.mass.conversions[canonicalizeUnit(preferredUnit)]) {
        const factor = unitsConfig.mass.conversions[canonicalizeUnit(preferredUnit)];
        return { quantity: baseQty / factor, unit: preferredUnit };
      }
      if (baseQty >= 1000) {
        return { quantity: baseQty / 1000, unit: 'kg' };
      }
      return { quantity: baseQty, unit: 'g' };
    }

    // Discrete / count
    return { quantity: baseQty, unit: preferredUnit || 'piece' };
  }

  /**
   * Formats a decimal number into a beautiful fraction string (e.g. 1.5 -> "1 ½", 0.75 -> "¾")
   */
  function formatFraction(num) {
    if (num === 0 || num === null || num === undefined || isNaN(num)) return '0';
    if (num < 0) return '-' + formatFraction(-num);

    const tolerance = 0.05;
    const whole = Math.floor(num);
    const remainder = num - whole;

    // Check fraction match
    const fractions = [
      { val: 0.125, str: '⅛' },
      { val: 0.166, str: '⅙' },
      { val: 0.2,   str: '⅕' },
      { val: 0.25,  str: '¼' },
      { val: 0.333, str: '⅓' },
      { val: 0.375, str: '⅜' },
      { val: 0.5,   str: '½' },
      { val: 0.625, str: '⅝' },
      { val: 0.666, str: '⅔' },
      { val: 0.75,  str: '¾' },
      { val: 0.8,   str: '⅘' },
      { val: 0.833, str: '⅚' },
      { val: 0.875, str: '⅞' }
    ];

    if (remainder < tolerance) {
      return whole.toString();
    }
    if (remainder > (1 - tolerance)) {
      return (whole + 1).toString();
    }

    let closestFraction = null;
    let minDiff = Infinity;

    for (const f of fractions) {
      const diff = Math.abs(remainder - f.val);
      if (diff <= tolerance && diff < minDiff) {
        minDiff = diff;
        closestFraction = f;
      }
    }

    if (closestFraction) {
      return whole > 0 ? `${whole} ${closestFraction.str}` : closestFraction.str;
    }

    // Default clean decimal
    const rounded = Math.round(num * 100) / 100;
    return rounded.toString();
  }

  /**
   * Formats quantity and unit together for clean UI rendering
   */
  function formatQuantityUnit(qty, unit) {
    if (!qty && qty !== 0) return unit || '';
    const fractionStr = formatFraction(qty);
    const cleanUnit = (unit || '').trim();

    if (!cleanUnit || cleanUnit === 'count') return fractionStr;
    
    // Pluralize simple units when quantity > 1
    if (qty > 1) {
      if (cleanUnit === 'cup') return `${fractionStr} cups`;
      if (cleanUnit === 'slice') return `${fractionStr} slices`;
      if (cleanUnit === 'clove') return `${fractionStr} cloves`;
      if (cleanUnit === 'can') return `${fractionStr} cans`;
      if (cleanUnit === 'piece') return `${fractionStr} pieces`;
      if (cleanUnit === 'bunch') return `${fractionStr} bunches`;
      if (cleanUnit === 'stalk') return `${fractionStr} stalks`;
      if (cleanUnit === 'leaf') return `${fractionStr} leaves`;
      if (cleanUnit === 'bag') return `${fractionStr} bags`;
      if (cleanUnit === 'bottle') return `${fractionStr} bottles`;
      if (cleanUnit === 'jar') return `${fractionStr} jars`;
      if (cleanUnit === 'egg') return `${fractionStr} eggs`;
    }

    return `${fractionStr} ${cleanUnit}`;
  }

  /**
   * Compare two units for dimension compatibility
   */
  function areUnitsCompatible(unitA, unitB) {
    const dimA = getUnitDimension(unitA);
    const dimB = getUnitDimension(unitB);
    if (dimA === dimB && (dimA === 'volume' || dimA === 'mass')) {
      return true;
    }
    return canonicalizeUnit(unitA) === canonicalizeUnit(unitB);
  }

  /**
   * Merge two quantities with compatible units
   */
  function mergeQuantities(qtyA, unitA, qtyB, unitB) {
    const baseA = toBase(qtyA, unitA);
    const baseB = toBase(qtyB, unitB);

    if (baseA.dimension === baseB.dimension && (baseA.dimension === 'volume' || baseA.dimension === 'mass')) {
      const totalBase = baseA.baseQty + baseB.baseQty;
      // Output in preferred unit if one was used prominently, or smart unit
      return fromBase(totalBase, baseA.dimension, unitA);
    }

    if (canonicalizeUnit(unitA) === canonicalizeUnit(unitB)) {
      return { quantity: qtyA + qtyB, unit: unitA };
    }

    // Incompatible units (e.g. 2 pieces + 100g)
    return null;
  }

  /**
   * Calculate deficit: Needed quantity minus Available pantry quantity
   * Returns { netQuantity, netUnit, fullyCovered, pantryUsed, deficitBase }
   */
  function subtractPantry(neededQty, neededUnit, pantryQty, pantryUnit) {
    const neededBase = toBase(neededQty, neededUnit);
    const pantryBase = toBase(pantryQty, pantryUnit);

    if (neededBase.dimension !== pantryBase.dimension && canonicalizeUnit(neededUnit) !== canonicalizeUnit(pantryUnit)) {
      // Incompatible dimensions, cannot directly subtract
      return {
        netQuantity: neededQty,
        netUnit: neededUnit,
        fullyCovered: false,
        pantryUsed: 0,
        incompatible: true
      };
    }

    const deficitBase = neededBase.baseQty - pantryBase.baseQty;

    if (deficitBase <= 0) {
      return {
        netQuantity: 0,
        netUnit: neededUnit,
        fullyCovered: true,
        pantryUsed: neededBase.baseQty,
        deficitBase: 0
      };
    }

    const netResult = fromBase(deficitBase, neededBase.dimension, neededUnit);
    return {
      netQuantity: netResult.quantity,
      netUnit: netResult.unit,
      fullyCovered: false,
      pantryUsed: pantryBase.baseQty,
      deficitBase: deficitBase
    };
  }

  return {
    loadConfig,
    canonicalizeUnit,
    getUnitDimension,
    toBase,
    fromBase,
    formatFraction,
    formatQuantityUnit,
    areUnitsCompatible,
    mergeQuantities,
    subtractPantry,
    getConfig: () => unitsConfig
  };
});
