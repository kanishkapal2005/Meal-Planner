/**
 * parse-ingredient.js - Free-text ingredient line parser
 * Pantry Meal Planner & Grocery Consolidator
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ParseIngredientModule = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Vulgar unicode fraction map
  const VULGAR_FRACTIONS = {
    '½': 0.5,
    '⅓': 1 / 3,
    '⅔': 2 / 3,
    '¼': 0.25,
    '¾': 0.75,
    '⅕': 0.2,
    '⅖': 0.4,
    '⅗': 0.6,
    '⅘': 0.8,
    '⅙': 1 / 6,
    '⅚': 5 / 6,
    '⅛': 0.125,
    '⅜': 0.375,
    '⅝': 0.625,
    '⅞': 0.875
  };

  // Known units list ordered by length descending to match longest first
  const KNOWN_UNITS = [
    'fluid ounces', 'fluid ounce', 'tablespoons', 'tablespoon', 'teaspoons', 'teaspoon',
    'milliliters', 'milliliter', 'kilograms', 'kilogram',
    'fl oz', 'tbsp', 'tbs', 'tsp', 'cups', 'cup',
    'grams', 'gram', 'kg', 'g', 'oz', 'lbs', 'lb', 'pounds', 'pound',
    'liters', 'liter', 'ml', 'l',
    'pints', 'pint', 'pt', 'quarts', 'quart', 'qt', 'gallons', 'gallon', 'gal',
    'cloves', 'clove', 'slices', 'slice', 'pieces', 'piece', 'cans', 'can',
    'bunches', 'bunch', 'pinches', 'pinch', 'dashes', 'dash', 'stalks', 'stalk',
    'heads', 'head', 'leaves', 'leaf', 'eggs', 'egg', 'packages', 'package',
    'packs', 'pack', 'bags', 'bag', 'bottles', 'bottle', 'jars', 'jar'
  ];

  // Aisle keyword lookup table
  const AISLE_KEYWORDS = {
    'Produce': [
      'apple', 'apples', 'banana', 'bananas', 'berry', 'berries', 'strawberry', 'strawberries',
      'blueberry', 'blueberries', 'spinach', 'baby spinach', 'kale', 'lettuce', 'tomato', 'tomatoes',
      'cherry tomato', 'cherry tomatoes', 'onion', 'onions', 'red onion', 'garlic', 'potato', 'potatoes',
      'carrot', 'carrots', 'broccoli', 'cauliflower', 'bell pepper', 'peppers', 'pepper', 'cucumber',
      'cucumbers', 'zucchini', 'avocado', 'avocados', 'lemon', 'lemons', 'lime', 'limes', 'ginger',
      'herb', 'herbs', 'basil', 'cilantro', 'parsley', 'rosemary', 'thyme', 'mint', 'mushroom', 'mushrooms',
      'asparagus', 'celery', 'cabbage'
    ],
    'Dairy & Eggs': [
      'milk', 'heavy cream', 'cream', 'half and half', 'butter', 'ghee', 'cheese', 'parmesan',
      'cheddar', 'mozzarella', 'feta', 'feta cheese', 'greek yogurt', 'yogurt', 'egg', 'eggs',
      'sour cream', 'cream cheese', 'cottage cheese', 'ricotta'
    ],
    'Meat & Seafood': [
      'chicken', 'chicken breast', 'chicken thighs', 'beef', 'ground beef', 'steak', 'pork', 'bacon',
      'turkey', 'ground turkey', 'salmon', 'tuna', 'shrimp', 'fish', 'cod', 'tilapia', 'prawns',
      'sausage', 'lamb'
    ],
    'Bakery': [
      'bread', 'sourdough', 'sourdough bread', 'baguette', 'ciabatta', 'tortilla', 'tortillas',
      'pita', 'naan', 'bun', 'buns', 'bagel', 'bagels', 'croissant', 'rolls'
    ],
    'Pantry & Grains': [
      'rice', 'brown rice', 'basmati rice', 'jasmine rice', 'pasta', 'penne', 'spaghetti', 'noodles',
      'rolled oats', 'oats', 'oatmeal', 'quinoa', 'flour', 'all-purpose flour', 'sugar', 'brown sugar',
      'powdered sugar', 'honey', 'maple syrup', 'olive oil', 'extra virgin olive oil', 'vegetable oil',
      'canola oil', 'coconut oil', 'sesame oil', 'chia seeds', 'flaxseeds', 'walnuts', 'almonds', 'nuts',
      'peanut butter', 'almond butter', 'lentils', 'red lentils', 'vegetable broth', 'chicken broth'
    ],
    'Canned & Jarred': [
      'chickpeas', 'black beans', 'kidney beans', 'canned beans', 'crushed tomatoes', 'diced tomatoes',
      'tomato paste', 'tomato sauce', 'coconut milk', 'sun-dried tomatoes', 'olives', 'kalamata olives',
      'artichoke hearts', 'corn', 'canned tuna'
    ],
    'Condiments & Spices': [
      'salt', 'sea salt', 'black pepper', 'pepper', 'turmeric', 'ground turmeric', 'cumin',
      'ground cumin', 'paprika', 'smoked paprika', 'oregano', 'cinnamon', 'ground cinnamon',
      'chili powder', 'red pepper flakes', 'cayenne', 'curry powder', 'soy sauce', 'tamari',
      'vinegar', 'balsamic vinegar', 'apple cider vinegar', 'dijon mustard', 'mustard',
      'mayonnaise', 'hot sauce', 'sriracha', 'vanilla', 'vanilla extract'
    ],
    'Frozen': [
      'frozen peas', 'frozen corn', 'frozen berries', 'ice cream', 'frozen spinach', 'frozen edamame'
    ]
  };

  /**
   * Guess grocery aisle from ingredient name
   */
  function guessAisle(ingredientName) {
    if (!ingredientName) return 'Other';
    const lower = ingredientName.toLowerCase();

    for (const [aisle, keywords] of Object.entries(AISLE_KEYWORDS)) {
      for (const kw of keywords) {
        // match whole word or substring
        const regex = new RegExp(`\\b${kw}\\b`, 'i');
        if (regex.test(lower) || lower.includes(kw)) {
          return aisle;
        }
      }
    }
    return 'Other';
  }

  /**
   * Canonicalize parsed unit to standard singular/canonical representation
   */
  function canonicalizeParsedUnit(unit) {
    if (!unit) return 'piece';
    const u = unit.toLowerCase().trim();
    if (u === 'cups' || u === 'cup' || u === 'c') return 'cup';
    if (u === 'tablespoons' || u === 'tablespoon' || u === 'tbsp' || u === 'tbs' || u === 'tb') return 'tbsp';
    if (u === 'teaspoons' || u === 'teaspoon' || u === 'tsp') return 'tsp';
    if (u === 'grams' || u === 'gram' || u === 'g') return 'g';
    if (u === 'kilograms' || u === 'kilogram' || u === 'kg') return 'kg';
    if (u === 'milliliters' || u === 'milliliter' || u === 'ml') return 'ml';
    if (u === 'liters' || u === 'liter' || u === 'l') return 'l';
    if (u === 'ounces' || u === 'ounce' || u === 'oz') return 'oz';
    if (u === 'pounds' || u === 'pound' || u === 'lbs' || u === 'lb') return 'lb';
    if (u === 'fluid ounces' || u === 'fluid ounce' || u === 'fl oz') return 'fl oz';
    if (u === 'cloves' || u === 'clove') return 'cloves';
    if (u === 'slices' || u === 'slice') return 'slices';
    if (u === 'cans' || u === 'can') return 'can';
    if (u === 'bunches' || u === 'bunch') return 'bunch';
    if (u === 'pinches' || u === 'pinch') return 'pinch';
    if (u === 'pieces' || u === 'piece' || u === 'item' || u === 'items') return 'piece';
    return u;
  }

  /**
   * Parse a raw ingredient text line into structured object:
   * { quantity, unit, name, aisle, raw }
   */
  function parseIngredientLine(rawLine) {
    if (!rawLine || typeof rawLine !== 'string') {
      return { quantity: 1, unit: 'piece', name: '', aisle: 'Other', raw: '' };
    }

    const trimmed = rawLine.trim();
    if (!trimmed) {
      return { quantity: 1, unit: 'piece', name: '', aisle: 'Other', raw: '' };
    }

    let line = trimmed;

    // 1. Replace vulgar unicode fractions with decimal equivalents or text
    for (const [char, val] of Object.entries(VULGAR_FRACTIONS)) {
      if (line.includes(char)) {
        // E.g. "1 ½" -> "1.5", or "½" -> "0.5"
        line = line.replace(new RegExp(`(\\d+)?\\s*${char}`, 'g'), (match, p1) => {
          const whole = p1 ? parseFloat(p1) : 0;
          return `${whole + val} `;
        });
      }
    }

    let quantity = 1;
    let unit = 'piece';
    let name = line;

    // 2. Check for ranges e.g. "1-2", "1 to 2", "2-3"
    const rangeRegex = /^(\d+(?:\.\d+)?|\d+\s*\/\s*\d+)\s*(?:-|to)\s*(\d+(?:\.\d+)?|\d+\s*\/\s*\d+)\b/i;
    const rangeMatch = line.match(rangeRegex);

    if (rangeMatch) {
      const q1 = parseQuantityToken(rangeMatch[1]);
      const q2 = parseQuantityToken(rangeMatch[2]);
      quantity = (q1 + q2) / 2; // Average of range
      line = line.substring(rangeMatch[0].length).trim();
    } else {
      // 3. Match mixed fraction or single number: "1 1/2", "3/4", "2.5", "2", "600g"
      const numberRegex = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?=[a-zA-Z\s]|$)/;
      const numMatch = line.match(numberRegex);
      if (numMatch) {
        quantity = parseQuantityToken(numMatch[1]);
        line = line.substring(numMatch[1].length).trim();
      }
    }

    // 4. Match unit after the number
    // Strip leading words like "of " if user typed e.g. "1 can of chickpeas"
    const unitPattern = KNOWN_UNITS.join('|').replace(/\s+/g, '\\s+');
    const unitRegex = new RegExp(`^(?:(${unitPattern})\\b(?:\\s+of\\b)?)`, 'i');
    const unitMatch = line.match(unitRegex);

    if (unitMatch) {
      unit = canonicalizeParsedUnit(unitMatch[1]);
      line = line.substring(unitMatch[0].length).trim();
    } else {
      // Check if unit is in parentheses e.g. "2 (400g) cans chickpeas" or "400g chicken"
      const parenUnitRegex = /^\((?:approx\.?\s*)?(\d+(?:\.\d+)?)\s*([a-z]+)\)/i;
      const parenMatch = line.match(parenUnitRegex);
      if (parenMatch) {
        quantity = parseFloat(parenMatch[1]);
        unit = canonicalizeParsedUnit(parenMatch[2]);
        line = line.substring(parenMatch[0].length).trim();
      } else {
        // Check attached unit e.g. "600g" or "250ml"
        const attachedUnitRegex = /^([a-z]+)\b/i;
        const attachedMatch = line.match(attachedUnitRegex);
        if (attachedMatch && KNOWN_UNITS.includes(attachedMatch[1].toLowerCase())) {
          unit = canonicalizeParsedUnit(attachedMatch[1]);
          line = line.substring(attachedMatch[0].length).trim();
        }
      }
    }

    // Clean up "of " if still leading
    line = line.replace(/^of\s+/i, '').trim();

    // 5. Clean up item name: strip trailing commas, preparations (minced, chopped, diced, to taste, optional, divided)
    name = line;
    const prepNotesRegex = /,\s*(minced|chopped|diced|sliced|peeled|crushed|rinsed|drained|to taste|divided|optional|halved|grated|melted|freshly ground|cooked|uncooked).*$/i;
    name = name.replace(prepNotesRegex, '').trim();

    // Remove any trailing or leading commas or parentheses
    name = name.replace(/[,\(\)]+$/g, '').replace(/^[,\(\)]+/g, '').trim();

    // If name is empty, revert to trimmed raw
    if (!name) {
      name = trimmed;
    }

    const aisle = guessAisle(name);

    return {
      quantity: Math.round(quantity * 100) / 100,
      unit: unit,
      name: name,
      aisle: aisle,
      raw: trimmed
    };
  }

  /**
   * Helper to parse string number tokens: "1 1/2", "3/4", "2.5"
   */
  function parseQuantityToken(token) {
    if (!token) return 1;
    const str = token.trim();

    // Mixed fraction: "1 1/2"
    if (str.includes(' ')) {
      const parts = str.split(/\s+/);
      const whole = parseFloat(parts[0]) || 0;
      const frac = parseQuantityToken(parts[1]);
      return whole + frac;
    }

    // Simple fraction: "3/4"
    if (str.includes('/')) {
      const [num, den] = str.split('/');
      const n = parseFloat(num);
      const d = parseFloat(den);
      return d !== 0 ? n / d : 1;
    }

    return parseFloat(str) || 1;
  }

  /**
   * Parse multiline text (e.g. pasted recipe ingredients)
   */
  function parseIngredientBlock(text) {
    if (!text || typeof text !== 'string') return [];
    return text
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#') && !line.startsWith('//'))
      .map(parseIngredientLine);
  }

  return {
    parseIngredientLine,
    parseIngredientBlock,
    parseQuantityToken,
    guessAisle,
    AISLE_KEYWORDS
  };
});
