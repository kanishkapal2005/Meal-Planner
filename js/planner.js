/**
 * planner.js - Weekly meal grid, serving scaling, leftovers, and nutrition
 * Pantry Meal Planner & Grocery Consolidator
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PlannerModule = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const DAY_LABELS = {
    monday: 'Monday',
    tuesday: 'Tuesday',
    wednesday: 'Wednesday',
    thursday: 'Thursday',
    friday: 'Friday',
    saturday: 'Saturday',
    sunday: 'Sunday'
  };

  const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
  const SLOT_LABELS = {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snacks & Treats'
  };

  let currentHouseholdId = 'household-default';
  let weeklyPlan = createEmptyPlan();
  let undoStack = [];

  function createEmptyPlan() {
    const plan = {};
    DAYS.forEach(day => {
      plan[day] = {};
      SLOTS.forEach(slot => {
        plan[day][slot] = []; // Array of meal objects in this slot
      });
    });
    return plan;
  }

  function getStorageKey(householdId) {
    return `pmp_v1_plan_${householdId || currentHouseholdId}`;
  }

  /**
   * Initialize planner with stored plan or starter sample schedule
   */
  function init(householdId, recipes) {
    currentHouseholdId = householdId || 'household-default';
    const key = getStorageKey(currentHouseholdId);
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        weeklyPlan = JSON.parse(stored);
      } else {
        // Create an appetizing starter sample schedule if recipes are available
        weeklyPlan = createEmptyPlan();
        if (recipes && recipes.length) {
          seedStarterPlan(recipes);
        }
        save();
      }
    } catch (e) {
      console.warn('LocalStorage error reading planner:', e);
      weeklyPlan = createEmptyPlan();
    }
    return weeklyPlan;
  }

  /**
   * Seeds an initial smart starter plan that demonstrates all features (including leftovers!)
   */
  function seedStarterPlan(recipes) {
    const rTuscan = recipes.find(r => r.id === 'recipe-1') || recipes[0];
    const rPenne = recipes.find(r => r.id === 'recipe-2') || recipes[1];
    const rOats = recipes.find(r => r.id === 'recipe-3') || recipes[2];
    const rSalad = recipes.find(r => r.id === 'recipe-4') || recipes[3];
    const rDahl = recipes.find(r => r.id === 'recipe-5') || recipes[4];
    const rStirFry = recipes.find(r => r.id === 'recipe-6') || recipes[5];

    if (rOats) {
      addMeal('monday', 'breakfast', rOats, 2);
      addMeal('wednesday', 'breakfast', rOats, 2);
    }
    if (rSalad) {
      addMeal('monday', 'lunch', rSalad, 2);
    }
    if (rTuscan) {
      addMeal('monday', 'dinner', rTuscan, 4);
      // Tuesday lunch is leftover from Monday dinner!
      addMeal('tuesday', 'lunch', rTuscan, 2, {
        isLeftover: true,
        leftoverFrom: 'Mon Dinner'
      });
    }
    if (rPenne) {
      addMeal('tuesday', 'dinner', rPenne, 3);
    }
    if (rDahl) {
      addMeal('wednesday', 'dinner', rDahl, 4);
      // Thursday lunch is leftover dahl!
      addMeal('thursday', 'lunch', rDahl, 2, {
        isLeftover: true,
        leftoverFrom: 'Wed Dinner'
      });
    }
    if (rStirFry) {
      addMeal('thursday', 'dinner', rStirFry, 3);
    }
  }

  function save() {
    try {
      const key = getStorageKey(currentHouseholdId);
      localStorage.setItem(key, JSON.stringify(weeklyPlan));
    } catch (e) {
      console.error('Failed to save weekly plan:', e);
    }
  }

  function getPlan() {
    return weeklyPlan;
  }

  /**
   * Add a meal to day and slot
   */
  function addMeal(day, slot, recipe, servings, extraOptions = {}) {
    if (!weeklyPlan[day]) weeklyPlan[day] = {};
    if (!weeklyPlan[day][slot]) weeklyPlan[day][slot] = [];

    const meal = {
      id: 'meal-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      recipeId: recipe.id,
      name: recipe.name,
      image: recipe.image,
      emoji: recipe.emoji || '🍽️',
      servings: servings || recipe.servings || 2,
      baseServings: recipe.servings || 2,
      tags: recipe.tags || [],
      isLeftover: !!extraOptions.isLeftover,
      leftoverFrom: extraOptions.leftoverFrom || null,
      sourceRecipe: recipe, // Embedded snapshot for offline reference
      addedAt: new Date().toISOString()
    };

    weeklyPlan[day][slot].push(meal);
    save();
    return meal;
  }

  /**
   * Scale servings for a scheduled meal
   */
  function scaleMealServings(day, slot, mealId, delta) {
    const slotList = weeklyPlan[day]?.[slot];
    if (!slotList) return null;
    const meal = slotList.find(m => m.id === mealId);
    if (meal) {
      meal.servings = Math.max(1, meal.servings + delta);
      save();
      return meal;
    }
    return null;
  }

  /**
   * Remove a meal from day and slot with undo support
   */
  function removeMeal(day, slot, mealId) {
    const slotList = weeklyPlan[day]?.[slot];
    if (!slotList) return null;
    const idx = slotList.findIndex(m => m.id === mealId);
    if (idx !== -1) {
      const [removed] = slotList.splice(idx, 1);
      undoStack.push({ type: 'remove_meal', day, slot, meal: removed, index: idx });
      save();
      return removed;
    }
    return null;
  }

  /**
   * Move a meal to another day and slot (drag and drop reschedule)
   */
  function moveMeal(sourceDay, sourceSlot, mealId, targetDay, targetSlot) {
    const sourceList = weeklyPlan[sourceDay]?.[sourceSlot];
    if (!sourceList) return false;
    const idx = sourceList.findIndex(m => m.id === mealId);
    if (idx === -1) return false;

    const [meal] = sourceList.splice(idx, 1);

    if (!weeklyPlan[targetDay]) weeklyPlan[targetDay] = {};
    if (!weeklyPlan[targetDay][targetSlot]) weeklyPlan[targetDay][targetSlot] = [];

    weeklyPlan[targetDay][targetSlot].push(meal);
    save();
    return true;
  }

  /**
   * Create a linked leftover meal in a target slot
   */
  function createLeftover(sourceDay, sourceSlot, mealId, targetDay, targetSlot) {
    const sourceList = weeklyPlan[sourceDay]?.[sourceSlot];
    if (!sourceList) return null;
    const meal = sourceList.find(m => m.id === mealId);
    if (!meal) return null;

    const leftoverLabel = `${DAY_LABELS[sourceDay].substring(0, 3)} ${SLOT_LABELS[sourceSlot]}`;
    return addMeal(targetDay, targetSlot, meal.sourceRecipe, Math.max(1, Math.floor(meal.servings / 2)), {
      isLeftover: true,
      leftoverFrom: leftoverLabel
    });
  }

  /**
   * Undo last removed meal
   */
  function undo() {
    const action = undoStack.pop();
    if (!action) return null;

    if (action.type === 'remove_meal') {
      if (!weeklyPlan[action.day]) weeklyPlan[action.day] = {};
      if (!weeklyPlan[action.day][action.slot]) weeklyPlan[action.day][action.slot] = [];
      weeklyPlan[action.day][action.slot].splice(action.index, 0, action.meal);
      save();
      return action;
    }
    return null;
  }

  /**
   * Clear all meals in the current week with undo support
   */
  function clearWeek() {
    const backup = JSON.parse(JSON.stringify(weeklyPlan));
    undoStack.push({ type: 'clear_week', plan: backup });
    weeklyPlan = createEmptyPlan();
    save();
  }

  /**
   * Calculate daily and weekly nutrition totals
   */
  function calculateNutrition() {
    const dailyNutrition = {};
    let weekCalories = 0;
    let weekProtein = 0;
    let weekCarbs = 0;
    let weekFat = 0;
    let totalMealsCount = 0;

    DAYS.forEach(day => {
      let dayCal = 0;
      let dayProt = 0;
      let dayCarb = 0;
      let dayFat = 0;

      SLOTS.forEach(slot => {
        const meals = weeklyPlan[day]?.[slot] || [];
        meals.forEach(meal => {
          totalMealsCount++;
          const nut = meal.sourceRecipe?.nutritionPerServing || {
            calories: 350,
            protein: 15,
            carbs: 40,
            fat: 12
          };
          const scale = (meal.servings || 1) / (meal.baseServings || 1);

          dayCal += Math.round(nut.calories * scale);
          dayProt += Math.round(nut.protein * scale);
          dayCarb += Math.round(nut.carbs * scale);
          dayFat += Math.round(nut.fat * scale);
        });
      });

      dailyNutrition[day] = {
        calories: dayCal,
        protein: dayProt,
        carbs: dayCarb,
        fat: dayFat
      };

      weekCalories += dayCal;
      weekProtein += dayProt;
      weekCarbs += dayCarb;
      weekFat += dayFat;
    });

    const activeDays = DAYS.filter(d => dailyNutrition[d].calories > 0).length || 1;

    return {
      daily: dailyNutrition,
      weekly: {
        totalCalories: weekCalories,
        totalProtein: weekProtein,
        totalCarbs: weekCarbs,
        totalFat: weekFat,
        avgCalories: Math.round(weekCalories / activeDays),
        avgProtein: Math.round(weekProtein / activeDays),
        avgCarbs: Math.round(weekCarbs / activeDays),
        avgFat: Math.round(weekFat / activeDays),
        totalMeals: totalMealsCount
      }
    };
  }

  /**
   * Populate plan automatically with recipes that maximize expiring pantry items
   */
  function autoFillExpiringMeals(useItUpSuggestions, recipes) {
    if (!useItUpSuggestions || !useItUpSuggestions.length) {
      if (!recipes || !recipes.length) return;
    }

    const availableSuggestions = [...useItUpSuggestions];
    const dinnerDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    dinnerDays.forEach((day, idx) => {
      // If dinner is empty, pick top recommendation or recipe
      if (!weeklyPlan[day]?.dinner || weeklyPlan[day].dinner.length === 0) {
        let recipeToSchedule = null;
        if (availableSuggestions.length > 0) {
          const top = availableSuggestions.shift();
          recipeToSchedule = top.recipe;
        } else if (recipes && recipes[idx % recipes.length]) {
          recipeToSchedule = recipes[idx % recipes.length];
        }

        if (recipeToSchedule) {
          addMeal(day, 'dinner', recipeToSchedule, recipeToSchedule.servings || 3);
        }
      }
    });

    save();
  }

  return {
    DAYS,
    DAY_LABELS,
    SLOTS,
    SLOT_LABELS,
    init,
    save,
    getPlan,
    addMeal,
    scaleMealServings,
    removeMeal,
    moveMeal,
    createLeftover,
    clearWeek,
    undo,
    calculateNutrition,
    autoFillExpiringMeals,
    setHousehold: (id, recipes) => init(id, recipes)
  };
});
