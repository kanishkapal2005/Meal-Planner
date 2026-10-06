/**
 * main.js - Master Application Controller
 * Pantry Meal Planner & Grocery Consolidator
 */

(function () {
  'use strict';

  // State Management
  const STATE = {
    recipes: [],
    currentHousehold: 'home',
    households: [
      { id: 'home', name: '🏠 Main Household' },
      { id: 'dorm', name: '🎒 Dorm / Apartment' },
      { id: 'office', name: '🏢 Office / Studio' }
    ],
    activeTab: 'plan', // 'plan' | 'recipes' | 'pantry' | 'shopping' | 'nutrition'
    recipeFilters: {
      search: '',
      tag: 'all',
      sortBy: 'name',
      page: 1,
      itemsPerPage: 6
    },
    pantryFilters: {
      search: '',
      status: 'all'
    },
    modalState: {
      recipeDetails: null,
      assignMeal: null
    }
  };

  // DOM Elements cache
  let DOM = {};

  /**
   * Application Initialization
   */
  async function initApp() {
    cacheDom();
    bindEvents();

    // 1. Initialize Units Configuration
    await UnitsModule.loadConfig();

    // 2. Load Households
    loadHouseholds();

    // 3. Load Recipes
    await loadRecipes();

    // 4. Initialize Submodules with active household
    PantryModule.init(STATE.currentHousehold);
    PlannerModule.init(STATE.currentHousehold, STATE.recipes);
    ShoppingModule.init(STATE.currentHousehold);

    // 5. Initialize Drag and Drop
    DndModule.init({
      onDrop: handleRecipeDroppedOnSlot,
      onRescheduleCallback: handleMealRescheduled
    });

    // 6. Initial Full Render
    renderHouseholdSelector();
    renderAllViews();
    showToast('Welcome to Pantry Meal Planner! 🥑', 'info');
  }

  function cacheDom() {
    DOM = {
      householdSelect: document.getElementById('household-select'),
      btnManageHouseholds: document.getElementById('btn-manage-households'),
      navTabs: document.querySelectorAll('.nav-tab'),
      tabPanes: document.querySelectorAll('.tab-pane'),

      // Recipes tab
      recipesGrid: document.getElementById('recipes-grid'),
      recipesSearch: document.getElementById('recipes-search'),
      recipeTagFilters: document.getElementById('recipe-tag-filters'),
      recipeSortSelect: document.getElementById('recipe-sort-select'),
      recipesPagination: document.getElementById('recipes-pagination'),
      btnAddRecipe: document.getElementById('btn-add-recipe'),
      btnImportRecipe: document.getElementById('btn-import-recipe'),
      btnExportRecipes: document.getElementById('btn-export-recipes'),

      // Planner tab
      weeklyPlannerTable: document.getElementById('weekly-planner-table'),
      plannerTableBody: document.getElementById('planner-table-body'),
      plannerNutritionFoot: document.getElementById('planner-nutrition-foot'),
      btnClearWeek: document.getElementById('btn-clear-week'),
      btnAutoPlan: document.getElementById('btn-autoplan'),
      btnPrintPlan: document.getElementById('btn-print-plan'),

      // Pantry tab
      pantryListContainer: document.getElementById('pantry-list-container'),
      pantryEmptyState: document.getElementById('pantry-empty-state'),
      pantrySearch: document.getElementById('pantry-search'),
      pantryStatusFilter: document.getElementById('pantry-status-filter'),
      pantryForm: document.getElementById('pantry-add-form'),
      useItUpContainer: document.getElementById('use-it-up-container'),

      // Shopping tab
      shoppingListContainer: document.getElementById('shopping-list-container'),
      shoppingEmptyState: document.getElementById('shopping-empty-state'),
      customItemForm: document.getElementById('custom-item-form'),
      btnShareList: document.getElementById('btn-share-list'),
      btnCopyList: document.getElementById('btn-copy-list'),
      btnClearChecked: document.getElementById('btn-clear-checked'),
      btnCheckAll: document.getElementById('btn-check-all'),
      shoppingStatsBadge: document.getElementById('shopping-stats-badge'),

      // Modals
      recipeModal: document.getElementById('modal-recipe-view'),
      recipeEditModal: document.getElementById('modal-recipe-edit'),
      importModal: document.getElementById('modal-import'),
      assignModal: document.getElementById('modal-assign-slot'),
      householdsModal: document.getElementById('modal-households'),

      // Toast container
      toastContainer: document.getElementById('toast-container')
    };
  }

  function bindEvents() {
    // Nav Tabs switching
    DOM.navTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const targetTab = tab.getAttribute('data-tab');
        setActiveTab(targetTab);
      });
    });

    // Household switch
    DOM.householdSelect?.addEventListener('change', (e) => {
      switchHousehold(e.target.value);
    });

    DOM.btnManageHouseholds?.addEventListener('click', openHouseholdsModal);

    // Recipes Filters & Search
    DOM.recipesSearch?.addEventListener('input', debounce((e) => {
      STATE.recipeFilters.search = e.target.value.trim();
      STATE.recipeFilters.page = 1;
      renderRecipesGrid();
    }, 250));

    DOM.recipeSortSelect?.addEventListener('change', (e) => {
      STATE.recipeFilters.sortBy = e.target.value;
      STATE.recipeFilters.page = 1;
      renderRecipesGrid();
    });

    // Pantry Search & Filter
    DOM.pantrySearch?.addEventListener('input', debounce((e) => {
      STATE.pantryFilters.search = e.target.value.trim().toLowerCase();
      renderPantryList();
    }, 200));

    DOM.pantryStatusFilter?.addEventListener('change', (e) => {
      STATE.pantryFilters.status = e.target.value;
      renderPantryList();
    });

    // Pantry Form Submit
    DOM.pantryForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target;
      const name = form['pantry-name'].value.trim();
      const quantity = parseFloat(form['pantry-quantity'].value) || 1;
      const unit = form['pantry-unit'].value.trim();
      const aisle = form['pantry-aisle'].value;
      const expiryDate = form['pantry-expiry'].value || null;

      if (!name) return;

      PantryModule.addItem({ name, quantity, unit, aisle, expiryDate });
      form.reset();
      showToast(`Added "${name}" to pantry 🥫`, 'success');
      renderPantryList();
      renderUseItUp();
      renderShoppingList();
    });

    // Shopping List Custom Item Form
    DOM.customItemForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target;
      const name = form['custom-name'].value.trim();
      const quantity = parseFloat(form['custom-quantity'].value) || 1;
      const unit = form['custom-unit'].value.trim();
      const aisle = form['custom-aisle'].value;

      if (!name) return;

      ShoppingModule.addCustomItem(name, quantity, unit, aisle);
      form.reset();
      showToast(`Added custom grocery item "${name}" 🛒`, 'success');
      renderShoppingList();
    });

    // Shopping Actions
    DOM.btnShareList?.addEventListener('click', async () => {
      const list = ShoppingModule.generateList(PlannerModule, PantryModule, UnitsModule);
      const text = ShoppingModule.formatAsPlainText(list, UnitsModule);
      const res = await ShoppingModule.shareList(text);
      if (res.success) {
        showToast(res.method === 'share' ? 'Shared successfully!' : 'Copied grocery list to clipboard! 📋', 'success');
      }
    });

    DOM.btnCopyList?.addEventListener('click', async () => {
      const list = ShoppingModule.generateList(PlannerModule, PantryModule, UnitsModule);
      const text = ShoppingModule.formatAsPlainText(list, UnitsModule);
      await ShoppingModule.shareList(text);
      showToast('Copied formatted grocery checklist to clipboard! 📋', 'success');
    });

    DOM.btnClearChecked?.addEventListener('click', () => {
      ShoppingModule.clearChecked();
      renderShoppingList();
      showToast('Cleared completed items', 'info');
    });

    DOM.btnCheckAll?.addEventListener('click', () => {
      const list = ShoppingModule.generateList(PlannerModule, PantryModule, UnitsModule);
      const allChecked = list.every(i => i.isChecked);
      ShoppingModule.setAllChecked(list, !allChecked);
      renderShoppingList();
    });

    // Planner Actions
    DOM.btnClearWeek?.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all meals for this week?')) {
        PlannerModule.clearWeek();
        renderPlannerGrid();
        renderShoppingList();
        showToast('Weekly plan cleared', 'info', {
          actionLabel: 'Undo',
          onAction: () => {
            PlannerModule.undo();
            renderPlannerGrid();
            renderShoppingList();
          }
        });
      }
    });

    DOM.btnAutoPlan?.addEventListener('click', () => {
      const suggestions = PantryModule.getUseItUpSuggestions(STATE.recipes);
      PlannerModule.autoFillExpiringMeals(suggestions, STATE.recipes);
      renderPlannerGrid();
      renderShoppingList();
      showToast('Auto-scheduled meals to use up expiring pantry stock! ✨', 'success');
    });

    DOM.btnPrintPlan?.addEventListener('click', () => {
      window.print();
    });

    // Recipe CRUD buttons
    DOM.btnAddRecipe?.addEventListener('click', () => openRecipeEditModal());
    DOM.btnImportRecipe?.addEventListener('click', () => openImportModal());
    DOM.btnExportRecipes?.addEventListener('click', exportRecipesToJson);

    // Modal Close buttons
    document.querySelectorAll('.modal-close, .modal-backdrop').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target === el) {
          closeAllModals();
        }
      });
    });

    // Keyboard ESC to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllModals();
    });
  }

  /**
   * Switch Active Tab
   */
  function setActiveTab(tabName) {
    STATE.activeTab = tabName;
    DOM.navTabs.forEach(t => {
      const isTarget = t.getAttribute('data-tab') === tabName;
      t.classList.toggle('active', isTarget);
      t.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    DOM.tabPanes.forEach(pane => {
      const isTarget = pane.id === `tab-${tabName}`;
      pane.classList.toggle('active', isTarget);
    });

    // Re-render relevant view
    if (tabName === 'plan') renderPlannerGrid();
    if (tabName === 'recipes') renderRecipesGrid();
    if (tabName === 'pantry') {
      renderPantryList();
      renderUseItUp();
    }
    if (tabName === 'shopping') renderShoppingList();
    if (tabName === 'nutrition') renderNutritionSummary();
  }

  /**
   * Load recipes from LocalStorage or data/recipes.json
   */
  async function loadRecipes() {
    const stored = localStorage.getItem('pmp_v1_recipes');
    if (stored) {
      try {
        STATE.recipes = JSON.parse(stored);
        if (STATE.recipes && STATE.recipes.length > 0) return;
      } catch (e) {
        console.warn('Error parsing cached recipes:', e);
      }
    }

    try {
      const res = await fetch('data/recipes.json');
      if (res.ok) {
        STATE.recipes = await res.json();
        saveRecipes();
        return;
      }
    } catch (e) {
      console.warn('Could not fetch data/recipes.json, falling back:', e);
    }

    // Default safety fallback if network/fetch fails
    if (!STATE.recipes || STATE.recipes.length === 0) {
      if (typeof window !== 'undefined' && Array.isArray(window.DEFAULT_RECIPES) && window.DEFAULT_RECIPES.length > 0) {
        STATE.recipes = JSON.parse(JSON.stringify(window.DEFAULT_RECIPES));
      } else {
        STATE.recipes = [
          {
            id: 'recipe-fallback-1',
            name: 'Classic Tomato Pasta',
            servings: 2,
            prepTime: 5,
            cookTime: 12,
            tags: ['Vegetarian', 'Quick', 'Dinner'],
            image: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281165?auto=format&fit=crop&w=600&q=80',
            emoji: '🍝',
            description: 'Quick pasta with rich tomato sauce and basil.',
            ingredients: [
              { name: 'penne pasta', quantity: 200, unit: 'g', aisle: 'Pantry & Grains' },
              { name: 'crushed tomatoes', quantity: 1, unit: 'can', aisle: 'Canned & Jarred' },
              { name: 'garlic', quantity: 2, unit: 'cloves', aisle: 'Produce' },
              { name: 'olive oil', quantity: 15, unit: 'ml', aisle: 'Pantry & Grains' }
            ],
            instructions: ['Cook pasta in salted water.', 'Simmer tomatoes and garlic.', 'Toss together.']
          }
        ];
      }
      saveRecipes();
    }
  }

  function saveRecipes() {
    try {
      localStorage.setItem('pmp_v1_recipes', JSON.stringify(STATE.recipes));
    } catch (e) {
      console.error('Failed to save recipes to storage:', e);
    }
  }

  /**
   * Household Management
   */
  function loadHouseholds() {
    try {
      const stored = localStorage.getItem('pmp_v1_households');
      if (stored) {
        STATE.households = JSON.parse(stored);
      } else {
        localStorage.setItem('pmp_v1_households', JSON.stringify(STATE.households));
      }
    } catch (e) {
      console.warn('Error reading households:', e);
    }

    const currentSaved = localStorage.getItem('pmp_v1_active_household');
    if (currentSaved && STATE.households.some(h => h.id === currentSaved)) {
      STATE.currentHousehold = currentSaved;
    } else {
      STATE.currentHousehold = STATE.households[0]?.id || 'home';
    }
  }

  function switchHousehold(householdId) {
    STATE.currentHousehold = householdId;
    localStorage.setItem('pmp_v1_active_household', householdId);

    // Re-initialize modules
    PantryModule.init(householdId);
    PlannerModule.init(householdId, STATE.recipes);
    ShoppingModule.init(householdId);

    renderHouseholdSelector();
    renderAllViews();
    showToast(`Switched household to "${getHouseholdName(householdId)}"`, 'info');
  }

  function getHouseholdName(id) {
    const h = STATE.households.find(item => item.id === id);
    return h ? h.name : id;
  }

  function renderHouseholdSelector() {
    if (!DOM.householdSelect) return;
    DOM.householdSelect.innerHTML = STATE.households
      .map(h => `<option value="${h.id}" ${h.id === STATE.currentHousehold ? 'selected' : ''}>${h.name}</option>`)
      .join('');
  }

  /**
   * Render All Main Views
   */
  function renderAllViews() {
    renderRecipesGrid();
    renderPlannerGrid();
    renderPantryList();
    renderUseItUp();
    renderShoppingList();
    renderNutritionSummary();
  }

  /**
   * 1. RECIPES VIEW RENDERING
   */
  function renderRecipesGrid() {
    if (!DOM.recipesGrid) return;

    // Filter recipes
    let filtered = STATE.recipes.filter(recipe => {
      // Search match
      if (STATE.recipeFilters.search) {
        const query = STATE.recipeFilters.search.toLowerCase();
        const inName = recipe.name.toLowerCase().includes(query);
        const inTags = (recipe.tags || []).some(t => t.toLowerCase().includes(query));
        const inIng = (recipe.ingredients || []).some(i => (i.name || i.raw || '').toLowerCase().includes(query));
        if (!inName && !inTags && !inIng) return false;
      }

      // Tag filter
      if (STATE.recipeFilters.tag !== 'all') {
        const targetTag = STATE.recipeFilters.tag.toLowerCase();
        const hasTag = (recipe.tags || []).some(t => t.toLowerCase() === targetTag);
        if (!hasTag) return false;
      }

      return true;
    });

    // Sort recipes
    const sort = STATE.recipeFilters.sortBy;
    if (sort === 'name') {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === 'quickest') {
      filtered.sort((a, b) => ((a.prepTime || 0) + (a.cookTime || 0)) - ((b.prepTime || 0) + (b.cookTime || 0)));
    } else if (sort === 'protein') {
      filtered.sort((a, b) => ((b.nutritionPerServing?.protein || 0) - (a.nutritionPerServing?.protein || 0)));
    }

    // Pagination
    const totalItems = filtered.length;
    const itemsPerPage = STATE.recipeFilters.itemsPerPage;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (STATE.recipeFilters.page > totalPages) STATE.recipeFilters.page = 1;

    const startIdx = (STATE.recipeFilters.page - 1) * itemsPerPage;
    const pageItems = filtered.slice(startIdx, startIdx + itemsPerPage);

    // Empty state
    if (pageItems.length === 0) {
      DOM.recipesGrid.innerHTML = `
        <div class="empty-state-card col-span-all">
          <div class="empty-icon">🍳</div>
          <h3>No recipes found</h3>
          <p>Try adjusting your search query or tag filters, or add your own custom recipe!</p>
          <button class="btn btn-primary" onclick="window.AntigravityApp.openRecipeEditModal()">+ Add New Recipe</button>
        </div>
      `;
      renderPagination(0, 1);
      return;
    }

    // Render cards
    DOM.recipesGrid.innerHTML = pageItems.map(recipe => {
      const totalTime = (recipe.prepTime || 0) + (recipe.cookTime || 0);
      const tagsHtml = (recipe.tags || [])
        .map(tag => `<span class="badge badge-subtle">${tag}</span>`)
        .join('');

      return `
        <article class="recipe-card" data-recipe-id="${recipe.id}">
          <div class="recipe-image-wrap">
            <img src="${recipe.image || 'https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=600&q=80'}" 
                 alt="${recipe.name}" 
                 loading="lazy"
                 onerror="this.src='https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=600&q=80'" />
            <div class="recipe-badge-time">⏱️ ${totalTime}m</div>
          </div>
          <div class="recipe-content">
            <div class="recipe-tags-row">${tagsHtml}</div>
            <h4 class="recipe-title">${recipe.name}</h4>
            <p class="recipe-desc">${recipe.description || 'Delicious home-cooked meal.'}</p>
            <div class="recipe-meta-row">
              <span>👥 ${recipe.servings || 2} servings</span>
              <span>🔥 ${recipe.nutritionPerServing?.calories || '~350'} kcal</span>
            </div>
            <div class="recipe-actions">
              <button class="btn btn-sm btn-outline btn-view-recipe" data-id="${recipe.id}">View Recipe</button>
              <button class="btn btn-sm btn-primary btn-assign-recipe" data-id="${recipe.id}">+ Add to Plan</button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    // Attach Drag and Drop handlers to cards
    DOM.recipesGrid.querySelectorAll('.recipe-card').forEach(card => {
      const recipeId = card.getAttribute('data-recipe-id');
      const recipe = STATE.recipes.find(r => r.id === recipeId);
      if (recipe) {
        DndModule.makeRecipeDraggable(card, recipe);
      }
    });

    // Attach View and Assign button handlers
    DOM.recipesGrid.querySelectorAll('.btn-view-recipe').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openRecipeDetailsModal(btn.getAttribute('data-id'));
      });
    });

    DOM.recipesGrid.querySelectorAll('.btn-assign-recipe').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAssignMealModal(btn.getAttribute('data-id'));
      });
    });

    renderPagination(totalPages, STATE.recipeFilters.page);
    renderTagFilters();
  }

  function renderTagFilters() {
    if (!DOM.recipeTagFilters) return;
    const commonTags = ['all', 'Quick', 'Vegetarian', 'High-Protein', 'Vegan', 'Gluten-Free', 'Breakfast', 'Lunch', 'Dinner'];

    DOM.recipeTagFilters.innerHTML = commonTags.map(tag => {
      const isSelected = STATE.recipeFilters.tag.toLowerCase() === tag.toLowerCase();
      return `
        <button class="chip-filter ${isSelected ? 'active' : ''}" data-tag="${tag}">
          ${tag === 'all' ? 'All Recipes' : tag}
        </button>
      `;
    }).join('');

    DOM.recipeTagFilters.querySelectorAll('.chip-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        STATE.recipeFilters.tag = btn.getAttribute('data-tag');
        STATE.recipeFilters.page = 1;
        renderRecipesGrid();
      });
    });
  }

  function renderPagination(totalPages, currentPage) {
    if (!DOM.recipesPagination) return;
    if (totalPages <= 1) {
      DOM.recipesPagination.innerHTML = '';
      return;
    }

    let html = `
      <button class="btn btn-sm btn-outline" ${currentPage === 1 ? 'disabled' : ''} id="btn-page-prev">← Prev</button>
      <span class="pagination-info">Page ${currentPage} of ${totalPages}</span>
      <button class="btn btn-sm btn-outline" ${currentPage === totalPages ? 'disabled' : ''} id="btn-page-next">Next →</button>
    `;

    DOM.recipesPagination.innerHTML = html;

    DOM.recipesPagination.querySelector('#btn-page-prev')?.addEventListener('click', () => {
      if (STATE.recipeFilters.page > 1) {
        STATE.recipeFilters.page--;
        renderRecipesGrid();
      }
    });

    DOM.recipesPagination.querySelector('#btn-page-next')?.addEventListener('click', () => {
      if (STATE.recipeFilters.page < totalPages) {
        STATE.recipeFilters.page++;
        renderRecipesGrid();
      }
    });
  }

  /**
   * 2. WEEKLY PLANNER GRID RENDERING
   */
  function renderPlannerGrid() {
    if (!DOM.plannerTableBody) return;

    const plan = PlannerModule.getPlan();
    const days = PlannerModule.DAYS;
    const slots = PlannerModule.SLOTS;
    const dayLabels = PlannerModule.DAY_LABELS;
    const slotLabels = PlannerModule.SLOT_LABELS;

    let tbodyHtml = '';

    slots.forEach(slot => {
      tbodyHtml += `<tr>`;
      // Row header slot
      tbodyHtml += `<th scope="row" class="planner-slot-header"><div class="slot-badge">${slotLabels[slot]}</div></th>`;

      days.forEach(day => {
        const meals = plan[day]?.[slot] || [];
        tbodyHtml += `<td class="planner-slot-cell" data-day="${day}" data-slot="${slot}">`;

        if (meals.length === 0) {
          tbodyHtml += `
            <div class="empty-slot-placeholder" data-day="${day}" data-slot="${slot}">
              <span class="empty-plus">+</span>
              <span class="empty-text">Drop or tap</span>
            </div>
          `;
        } else {
          meals.forEach(meal => {
            const isLeftover = meal.isLeftover;
            const leftoverBadge = isLeftover
              ? `<div class="meal-leftover-chip">🍱 ${meal.leftoverFrom || 'Leftover'}</div>`
              : '';

            tbodyHtml += `
              <div class="scheduled-meal-card ${isLeftover ? 'is-leftover-meal' : ''}" 
                   data-meal-id="${meal.id}" 
                   data-day="${day}" 
                   data-slot="${slot}">
                <div class="meal-card-top">
                  <div class="meal-title-wrap">
                    <span class="meal-emoji">${meal.emoji || '🍽️'}</span>
                    <strong class="meal-name">${meal.name}</strong>
                  </div>
                  <button class="btn-icon-subtle btn-remove-meal" title="Remove meal" data-id="${meal.id}" data-day="${day}" data-slot="${slot}">✕</button>
                </div>
                ${leftoverBadge}
                <div class="meal-card-controls">
                  <div class="servings-stepper">
                    <button class="step-btn step-minus" data-id="${meal.id}" data-day="${day}" data-slot="${slot}">−</button>
                    <span class="servings-display">${meal.servings} serv</span>
                    <button class="step-btn step-plus" data-id="${meal.id}" data-day="${day}" data-slot="${slot}">+</button>
                  </div>
                  ${!isLeftover ? `
                    <button class="btn-leftover-reuse" title="Create leftover meal for next day" data-id="${meal.id}" data-day="${day}" data-slot="${slot}">
                      🍱 +Leftover
                    </button>
                  ` : ''}
                </div>
              </div>
            `;
          });
        }

        tbodyHtml += `</td>`;
      });

      tbodyHtml += `</tr>`;
    });

    DOM.plannerTableBody.innerHTML = tbodyHtml;

    // Attach Drop Zones & Draggable Meal cards
    DOM.plannerTableBody.querySelectorAll('.planner-slot-cell').forEach(cell => {
      const day = cell.getAttribute('data-day');
      const slot = cell.getAttribute('data-slot');
      DndModule.setupDropZone(cell, day, slot);

      // Tap-to-add for empty cell
      cell.querySelector('.empty-slot-placeholder')?.addEventListener('click', () => {
        openQuickSlotAssignModal(day, slot);
      });
    });

    DOM.plannerTableBody.querySelectorAll('.scheduled-meal-card').forEach(card => {
      const mealId = card.getAttribute('data-meal-id');
      const day = card.getAttribute('data-day');
      const slot = card.getAttribute('data-slot');
      const meal = plan[day]?.[slot]?.find(m => m.id === mealId);
      if (meal) {
        DndModule.makeMealDraggable(card, meal, day, slot);
      }
    });

    // Servings Stepper handlers
    DOM.plannerTableBody.querySelectorAll('.step-minus').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const day = btn.getAttribute('data-day');
        const slot = btn.getAttribute('data-slot');
        PlannerModule.scaleMealServings(day, slot, id, -1);
        renderPlannerGrid();
        renderShoppingList();
      });
    });

    DOM.plannerTableBody.querySelectorAll('.step-plus').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const day = btn.getAttribute('data-day');
        const slot = btn.getAttribute('data-slot');
        PlannerModule.scaleMealServings(day, slot, id, 1);
        renderPlannerGrid();
        renderShoppingList();
      });
    });

    // Remove meal handlers
    DOM.plannerTableBody.querySelectorAll('.btn-remove-meal').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const day = btn.getAttribute('data-day');
        const slot = btn.getAttribute('data-slot');
        const removed = PlannerModule.removeMeal(day, slot, id);
        if (removed) {
          renderPlannerGrid();
          renderShoppingList();
          showToast(`Removed "${removed.name}"`, 'info', {
            actionLabel: 'Undo',
            onAction: () => {
              PlannerModule.undo();
              renderPlannerGrid();
              renderShoppingList();
            }
          });
        }
      });
    });

    // Create Leftover handlers
    DOM.plannerTableBody.querySelectorAll('.btn-leftover-reuse').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const day = btn.getAttribute('data-day');
        const slot = btn.getAttribute('data-slot');
        openCreateLeftoverModal(day, slot, id);
      });
    });

    renderPlannerNutritionFoot();
  }

  function renderPlannerNutritionFoot() {
    if (!DOM.plannerNutritionFoot) return;
    const nutrition = PlannerModule.calculateNutrition();
    const days = PlannerModule.DAYS;

    let footHtml = `<tr><th scope="row" class="planner-slot-header"><div class="slot-badge-nutrition">Est. Daily Nutrition</div></th>`;

    days.forEach(day => {
      const d = nutrition.daily[day];
      if (d.calories > 0) {
        footHtml += `
          <td class="nutrition-cell">
            <div class="nutrition-stat-pill">🔥 <strong>${d.calories}</strong> kcal</div>
            <div class="nutrition-sub">💪 ${d.protein}g P · 🍞 ${d.carbs}g C · 🥑 ${d.fat}g F</div>
          </td>
        `;
      } else {
        footHtml += `<td class="nutrition-cell text-muted"><span class="nutrition-empty">—</span></td>`;
      }
    });

    footHtml += `</tr>`;
    DOM.plannerNutritionFoot.innerHTML = footHtml;
  }

  /**
   * 3. PANTRY VIEW & EXPIRY RENDERING
   */
  function renderPantryList() {
    if (!DOM.pantryListContainer) return;

    let items = PantryModule.getItems();

    // Search filter
    if (STATE.pantryFilters.search) {
      items = items.filter(i => i.name.toLowerCase().includes(STATE.pantryFilters.search));
    }

    // Status filter
    if (STATE.pantryFilters.status !== 'all') {
      items = items.filter(i => {
        const exp = PantryModule.getExpiryStatus(i.expiryDate);
        return exp.status === STATE.pantryFilters.status;
      });
    }

    // Sort by urgency of expiry date
    items.sort((a, b) => {
      if (!a.expiryDate && !b.expiryDate) return 0;
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      return new Date(a.expiryDate) - new Date(b.expiryDate);
    });

    if (items.length === 0) {
      DOM.pantryListContainer.innerHTML = `
        <div class="empty-state-card">
          <div class="empty-icon">🥫</div>
          <h4>Pantry is empty</h4>
          <p>Add ingredients using the form above to track freshness and subtract from your grocery list.</p>
        </div>
      `;
      return;
    }

    DOM.pantryListContainer.innerHTML = items.map(item => {
      const exp = PantryModule.getExpiryStatus(item.expiryDate);
      const formattedQty = UnitsModule.formatQuantityUnit(item.quantity, item.unit);

      return `
        <div class="pantry-card ${exp.chipClass}-border" data-pantry-id="${item.id}">
          <div class="pantry-card-main">
            <div class="pantry-item-info">
              <h4 class="pantry-item-name">${item.name}</h4>
              <span class="badge badge-subtle">${item.aisle}</span>
              ${item.notes ? `<small class="pantry-item-notes">${item.notes}</small>` : ''}
            </div>
            <div class="pantry-expiry-chip ${exp.chipClass}">
              <span>${exp.icon}</span>
              <span>${exp.label}</span>
            </div>
          </div>
          <div class="pantry-card-bottom">
            <div class="pantry-qty-adjuster">
              <button class="step-btn btn-pantry-minus" data-id="${item.id}">−</button>
              <span class="pantry-qty-text"><strong>${formattedQty}</strong></span>
              <button class="step-btn btn-pantry-plus" data-id="${item.id}">+</button>
            </div>
            <button class="btn-icon-subtle btn-delete-pantry" data-id="${item.id}" title="Remove item">🗑️</button>
          </div>
        </div>
      `;
    }).join('');

    // Attach step & delete listeners
    DOM.pantryListContainer.querySelectorAll('.btn-pantry-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        PantryModule.adjustQuantity(id, -1);
        renderPantryList();
        renderUseItUp();
        renderShoppingList();
      });
    });

    DOM.pantryListContainer.querySelectorAll('.btn-pantry-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        PantryModule.adjustQuantity(id, 1);
        renderPantryList();
        renderUseItUp();
        renderShoppingList();
      });
    });

    DOM.pantryListContainer.querySelectorAll('.btn-delete-pantry').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const deleted = PantryModule.deleteItem(id);
        if (deleted) {
          renderPantryList();
          renderUseItUp();
          renderShoppingList();
          showToast(`Deleted "${deleted.name}" from pantry`, 'info', {
            actionLabel: 'Undo',
            onAction: () => {
              PantryModule.undo();
              renderPantryList();
              renderUseItUp();
              renderShoppingList();
            }
          });
        }
      });
    });
  }

  /**
   * 4. 'USE IT UP' SUGGESTIONS ENGINE RENDERING
   */
  function renderUseItUp() {
    if (!DOM.useItUpContainer) return;

    const suggestions = PantryModule.getUseItUpSuggestions(STATE.recipes);

    if (suggestions.length === 0) {
      DOM.useItUpContainer.innerHTML = `
        <div class="use-it-up-empty">
          <p>🎉 Great news! No pantry items are expiring soon. Your pantry is fresh and well-managed.</p>
        </div>
      `;
      return;
    }

    DOM.useItUpContainer.innerHTML = suggestions.slice(0, 3).map(s => {
      const itemsList = s.matchedItems
        .map(m => `<span class="exp-matched-tag">⚡ ${m.name} (${m.label})</span>`)
        .join(' ');

      return `
        <div class="use-it-up-card">
          <div class="use-it-up-header">
            <span class="waste-badge">✨ Prevents Waste</span>
            <span class="match-percent">${s.percentUsed}% pantry covered</span>
          </div>
          <div class="use-it-up-body">
            <img src="${s.recipe.image}" alt="${s.recipe.name}" class="use-it-up-img" />
            <div class="use-it-up-content">
              <h4>${s.recipe.name}</h4>
              <p class="use-it-up-items-lead">Uses expiring ingredients:</p>
              <div class="matched-items-row">${itemsList}</div>
            </div>
          </div>
          <div class="use-it-up-footer">
            <button class="btn btn-sm btn-primary btn-schedule-suggestion" data-id="${s.recipe.id}">
              🗓️ Schedule to Plan
            </button>
          </div>
        </div>
      `;
    }).join('');

    DOM.useItUpContainer.querySelectorAll('.btn-schedule-suggestion').forEach(btn => {
      btn.addEventListener('click', () => {
        openAssignMealModal(btn.getAttribute('data-id'));
      });
    });
  }

  /**
   * 5. CONSOLIDATED SHOPPING LIST RENDERING
   */
  function renderShoppingList() {
    if (!DOM.shoppingListContainer) return;

    const list = ShoppingModule.generateList(PlannerModule, PantryModule, UnitsModule);
    const toBuyItems = list.filter(i => !i.fullyCovered);
    const coveredItems = list.filter(i => i.fullyCovered);

    if (DOM.shoppingStatsBadge) {
      DOM.shoppingStatsBadge.textContent = `${toBuyItems.length} items to buy (${coveredItems.length} covered by pantry)`;
    }

    if (list.length === 0) {
      DOM.shoppingListContainer.innerHTML = `
        <div class="empty-state-card">
          <div class="empty-icon">🛒</div>
          <h3>Your shopping list is clear!</h3>
          <p>Drag or schedule meals onto the weekly planner grid, and all consolidated ingredients will automatically calculate here.</p>
          <button class="btn btn-primary" onclick="window.AntigravityApp.setActiveTab('plan')">Go to Weekly Planner</button>
        </div>
      `;
      return;
    }

    const grouped = ShoppingModule.groupByAisle(toBuyItems);
    let html = '';

    for (const [aisle, items] of Object.entries(grouped)) {
      if (!items || items.length === 0) continue;

      html += `
        <section class="shopping-aisle-group">
          <h4 class="aisle-header">
            <span class="aisle-pin">📍</span> ${aisle}
            <span class="aisle-count">${items.length}</span>
          </h4>
          <ul class="shopping-items-list">
      `;

      items.forEach(item => {
        const checkedClass = item.isChecked ? 'is-purchased' : '';
        const qtyFormatted = UnitsModule.formatQuantityUnit(item.toBuyQty, item.toBuyUnit);

        let pantryNote = '';
        if (item.pantryMatch && item.pantryQty > 0) {
          const pFormatted = UnitsModule.formatQuantityUnit(item.pantryQty, item.pantryUnit);
          pantryNote = `
            <span class="pantry-offset-pill">
              🥫 Has ${pFormatted} in pantry (−offset applied)
            </span>
          `;
        }

        const reasonsHtml = item.reasons
          .map(r => `<span class="shopping-reason-tag">${r}</span>`)
          .join('');

        html += `
          <li class="shopping-item-row ${checkedClass}" data-key="${item.key}">
            <label class="shopping-label">
              <input type="checkbox" class="shopping-checkbox" data-key="${item.key}" ${item.isChecked ? 'checked' : ''} />
              <span class="checkbox-custom"></span>
              <div class="shopping-item-text">
                <div class="shopping-item-headline">
                  <strong class="item-name">${item.name}</strong>
                  <span class="item-quantity">${qtyFormatted}</span>
                </div>
                ${pantryNote}
                <div class="shopping-reasons-wrap">${reasonsHtml}</div>
              </div>
            </label>
            ${item.isCustom ? `
              <button class="btn-icon-subtle btn-remove-custom" data-id="${item.customId}" title="Delete custom item">🗑️</button>
            ` : ''}
          </li>
        `;
      });

      html += `
          </ul>
        </section>
      `;
    }

    // Collapsible "Covered by pantry" section
    if (coveredItems.length > 0) {
      html += `
        <details class="pantry-covered-accordion">
          <summary class="covered-summary">
            <span>✨ <strong>${coveredItems.length} items</strong> already covered by your pantry</span>
            <span class="covered-caret">▼</span>
          </summary>
          <ul class="covered-items-list">
            ${coveredItems.map(item => `
              <li>
                <span class="covered-check">✓</span>
                <span class="covered-name">${item.name}</span>
                <span class="covered-qty">(${UnitsModule.formatQuantityUnit(item.totalNeededQty, item.totalNeededUnit)})</span>
                <span class="covered-note">Found in pantry</span>
              </li>
            `).join('')}
          </ul>
        </details>
      `;
    }

    DOM.shoppingListContainer.innerHTML = html;

    // Checkbox toggles
    DOM.shoppingListContainer.querySelectorAll('.shopping-checkbox').forEach(chk => {
      chk.addEventListener('change', () => {
        const key = chk.getAttribute('data-key');
        ShoppingModule.toggleChecked(key);
        renderShoppingList();
      });
    });

    // Custom item deletes
    DOM.shoppingListContainer.querySelectorAll('.btn-remove-custom').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        ShoppingModule.removeCustomItem(id);
        renderShoppingList();
      });
    });
  }

  /**
   * 6. NUTRITION SUMMARY VIEW
   */
  function renderNutritionSummary() {
    const container = document.getElementById('nutrition-dashboard-container');
    if (!container) return;

    const nutrition = PlannerModule.calculateNutrition();
    const days = PlannerModule.DAYS;
    const dayLabels = PlannerModule.DAY_LABELS;
    const weekly = nutrition.weekly;

    let cardsHtml = '';
    days.forEach(day => {
      const d = nutrition.daily[day];
      cardsHtml += `
        <div class="nutrition-day-card">
          <h4 class="nutri-day-title">${dayLabels[day]}</h4>
          <div class="nutri-big-cal">${d.calories} <small>kcal</small></div>
          <div class="nutri-macros-row">
            <div class="macro-badge macro-protein">
              <span class="macro-label">Protein</span>
              <span class="macro-val">${d.protein}g</span>
            </div>
            <div class="macro-badge macro-carbs">
              <span class="macro-label">Carbs</span>
              <span class="macro-val">${d.carbs}g</span>
            </div>
            <div class="macro-badge macro-fat">
              <span class="macro-label">Fat</span>
              <span class="macro-val">${d.fat}g</span>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = `
      <div class="nutrition-weekly-overview">
        <div class="overview-metric">
          <span class="metric-title">Avg Daily Calories</span>
          <span class="metric-number">${weekly.avgCalories} kcal</span>
        </div>
        <div class="overview-metric">
          <span class="metric-title">Daily Protein Avg</span>
          <span class="metric-number">${weekly.avgProtein}g</span>
        </div>
        <div class="overview-metric">
          <span class="metric-title">Daily Carbs Avg</span>
          <span class="metric-number">${weekly.avgCarbs}g</span>
        </div>
        <div class="overview-metric">
          <span class="metric-title">Daily Fat Avg</span>
          <span class="metric-number">${weekly.avgFat}g</span>
        </div>
      </div>
      <div class="nutrition-daily-grid">
        ${cardsHtml}
      </div>
    `;
  }

  /**
   * MODALS & POPUPS
   */
  function openRecipeDetailsModal(recipeId) {
    const recipe = STATE.recipes.find(r => r.id === recipeId);
    if (!recipe || !DOM.recipeModal) return;

    let currentServings = recipe.servings || 2;
    const baseServings = recipe.servings || 2;

    function renderModalIngredients(servings) {
      const scale = servings / baseServings;
      return (recipe.ingredients || []).map(ing => {
        const scaledQty = (parseFloat(ing.quantity) || 1) * scale;
        const formatted = UnitsModule.formatQuantityUnit(scaledQty, ing.unit);
        return `
          <li class="recipe-modal-ingredient">
            <span class="ing-bullet">•</span>
            <strong class="ing-qty">${formatted}</strong>
            <span class="ing-name">${ing.name || ing.raw}</span>
            <span class="badge badge-subtle">${ing.aisle || 'Pantry'}</span>
          </li>
        `;
      }).join('');
    }

    const instructionsHtml = (recipe.instructions || []).map((step, idx) => `
      <li class="recipe-step-item">
        <span class="step-num">${idx + 1}</span>
        <span class="step-text">${step}</span>
      </li>
    `).join('');

    const modalBody = DOM.recipeModal.querySelector('.modal-body-content');
    modalBody.innerHTML = `
      <div class="recipe-detail-header">
        <img src="${recipe.image}" alt="${recipe.name}" class="recipe-detail-banner" />
        <h2 class="recipe-detail-title">${recipe.name}</h2>
        <div class="recipe-detail-meta">
          <span>⏱️ Prep: ${recipe.prepTime || 10}m</span>
          <span>🍳 Cook: ${recipe.cookTime || 15}m</span>
          <span>🔥 ${recipe.nutritionPerServing?.calories || '~400'} kcal/serving</span>
        </div>
        <p class="recipe-detail-description">${recipe.description || ''}</p>
      </div>

      <div class="servings-scaler-box">
        <label><strong>Adjust Servings:</strong></label>
        <div class="servings-stepper modal-stepper">
          <button class="step-btn" id="modal-servings-minus">−</button>
          <span class="servings-display" id="modal-servings-count">${currentServings} servings</span>
          <button class="step-btn" id="modal-servings-plus">+</button>
        </div>
        <small class="text-muted">Ingredient amounts update automatically</small>
      </div>

      <div class="recipe-detail-columns">
        <div class="recipe-detail-ingredients">
          <h3>Ingredients</h3>
          <ul class="modal-ingredients-list" id="modal-ingredients-container">
            ${renderModalIngredients(currentServings)}
          </ul>
        </div>
        <div class="recipe-detail-instructions">
          <h3>Instructions</h3>
          <ol class="modal-instructions-list">
            ${instructionsHtml}
          </ol>
        </div>
      </div>

      <div class="recipe-modal-footer">
        <button class="btn btn-outline modal-close-btn">Close</button>
        <button class="btn btn-primary" id="btn-schedule-from-detail">🗓️ Add to Weekly Plan</button>
      </div>
    `;

    // Bind scaler stepper
    modalBody.querySelector('#modal-servings-minus').addEventListener('click', () => {
      if (currentServings > 1) {
        currentServings--;
        modalBody.querySelector('#modal-servings-count').textContent = `${currentServings} servings`;
        modalBody.querySelector('#modal-ingredients-container').innerHTML = renderModalIngredients(currentServings);
      }
    });

    modalBody.querySelector('#modal-servings-plus').addEventListener('click', () => {
      currentServings++;
      modalBody.querySelector('#modal-servings-count').textContent = `${currentServings} servings`;
      modalBody.querySelector('#modal-ingredients-container').innerHTML = renderModalIngredients(currentServings);
    });

    modalBody.querySelector('#btn-schedule-from-detail').addEventListener('click', () => {
      closeAllModals();
      openAssignMealModal(recipe.id, currentServings);
    });

    modalBody.querySelector('.modal-close-btn').addEventListener('click', closeAllModals);

    openModal(DOM.recipeModal);
  }

  function openAssignMealModal(recipeId, initialServings) {
    const recipe = STATE.recipes.find(r => r.id === recipeId);
    if (!recipe || !DOM.assignModal) return;

    const modalBody = DOM.assignModal.querySelector('.modal-body-content');
    modalBody.innerHTML = `
      <h3>Add to Weekly Plan</h3>
      <p>Assign <strong>${recipe.name}</strong> to a day and meal slot:</p>
      
      <form id="assign-meal-form">
        <div class="form-group">
          <label for="assign-day">Day of the Week:</label>
          <select id="assign-day" class="form-control" required>
            ${PlannerModule.DAYS.map(d => `<option value="${d}">${PlannerModule.DAY_LABELS[d]}</option>`).join('')}
          </select>
        </div>

        <div class="form-group">
          <label for="assign-slot">Meal Slot:</label>
          <select id="assign-slot" class="form-control" required>
            ${PlannerModule.SLOTS.map(s => `<option value="${s}" ${s === 'dinner' ? 'selected' : ''}>${PlannerModule.SLOT_LABELS[s]}</option>`).join('')}
          </select>
        </div>

        <div class="form-group">
          <label for="assign-servings">Servings to Cook:</label>
          <input type="number" id="assign-servings" class="form-control" min="1" max="20" value="${initialServings || recipe.servings || 2}" required />
        </div>

        <div class="modal-actions-row">
          <button type="button" class="btn btn-outline modal-close-btn">Cancel</button>
          <button type="submit" class="btn btn-primary">Schedule Meal</button>
        </div>
      </form>
    `;

    modalBody.querySelector('.modal-close-btn').addEventListener('click', closeAllModals);

    modalBody.querySelector('#assign-meal-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const day = e.target['assign-day'].value;
      const slot = e.target['assign-slot'].value;
      const servings = parseInt(e.target['assign-servings'].value, 10) || 2;

      PlannerModule.addMeal(day, slot, recipe, servings);
      closeAllModals();
      renderPlannerGrid();
      renderShoppingList();
      showToast(`Scheduled "${recipe.name}" for ${PlannerModule.DAY_LABELS[day]} ${PlannerModule.SLOT_LABELS[slot]}!`, 'success');
      setActiveTab('plan');
    });

    openModal(DOM.assignModal);
  }

  function openQuickSlotAssignModal(day, slot) {
    if (!DOM.assignModal) return;

    const modalBody = DOM.assignModal.querySelector('.modal-body-content');
    modalBody.innerHTML = `
      <h3>Schedule Meal</h3>
      <p>Target: <strong>${PlannerModule.DAY_LABELS[day]} ${PlannerModule.SLOT_LABELS[slot]}</strong></p>
      
      <form id="quick-assign-form">
        <div class="form-group">
          <label for="select-recipe">Choose Recipe:</label>
          <select id="select-recipe" class="form-control" required>
            ${STATE.recipes.map(r => `<option value="${r.id}">${r.name} (${r.servings || 2} serv)</option>`).join('')}
          </select>
        </div>

        <div class="form-group">
          <label for="quick-servings">Servings:</label>
          <input type="number" id="quick-servings" class="form-control" min="1" max="20" value="2" required />
        </div>

        <div class="modal-actions-row">
          <button type="button" class="btn btn-outline modal-close-btn">Cancel</button>
          <button type="submit" class="btn btn-primary">Add to Schedule</button>
        </div>
      </form>
    `;

    modalBody.querySelector('.modal-close-btn').addEventListener('click', closeAllModals);

    modalBody.querySelector('#quick-assign-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const recipeId = e.target['select-recipe'].value;
      const servings = parseInt(e.target['quick-servings'].value, 10) || 2;
      const recipe = STATE.recipes.find(r => r.id === recipeId);

      if (recipe) {
        PlannerModule.addMeal(day, slot, recipe, servings);
        closeAllModals();
        renderPlannerGrid();
        renderShoppingList();
        showToast(`Added "${recipe.name}" to ${PlannerModule.DAY_LABELS[day]}!`, 'success');
      }
    });

    openModal(DOM.assignModal);
  }

  function openCreateLeftoverModal(sourceDay, sourceSlot, mealId) {
    if (!DOM.assignModal) return;

    const meal = PlannerModule.getPlan()[sourceDay]?.[sourceSlot]?.find(m => m.id === mealId);
    if (!meal) return;

    const nextDays = PlannerModule.DAYS;
    const currentIdx = nextDays.indexOf(sourceDay);
    const suggestedDay = nextDays[(currentIdx + 1) % 7];

    const modalBody = DOM.assignModal.querySelector('.modal-body-content');
    modalBody.innerHTML = `
      <h3>🍱 Schedule Leftover</h3>
      <p>Reuse portions of <strong>${meal.name}</strong> from ${PlannerModule.DAY_LABELS[sourceDay]} ${PlannerModule.SLOT_LABELS[sourceSlot]}:</p>
      
      <form id="create-leftover-form">
        <div class="form-group">
          <label for="leftover-day">Destination Day:</label>
          <select id="leftover-day" class="form-control" required>
            ${nextDays.map(d => `<option value="${d}" ${d === suggestedDay ? 'selected' : ''}>${PlannerModule.DAY_LABELS[d]}</option>`).join('')}
          </select>
        </div>

        <div class="form-group">
          <label for="leftover-slot">Destination Slot:</label>
          <select id="leftover-slot" class="form-control" required>
            ${PlannerModule.SLOTS.map(s => `<option value="${s}" ${s === 'lunch' ? 'selected' : ''}>${PlannerModule.SLOT_LABELS[s]}</option>`).join('')}
          </select>
        </div>

        <p class="text-muted"><small>💡 Leftover meals reuse cooked food, so no duplicate ingredients will be added to your shopping list!</small></p>

        <div class="modal-actions-row">
          <button type="button" class="btn btn-outline modal-close-btn">Cancel</button>
          <button type="submit" class="btn btn-primary">Create Leftover</button>
        </div>
      </form>
    `;

    modalBody.querySelector('.modal-close-btn').addEventListener('click', closeAllModals);

    modalBody.querySelector('#create-leftover-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const targetDay = e.target['leftover-day'].value;
      const targetSlot = e.target['leftover-slot'].value;

      PlannerModule.createLeftover(sourceDay, sourceSlot, mealId, targetDay, targetSlot);
      closeAllModals();
      renderPlannerGrid();
      renderShoppingList();
      showToast(`Created leftover meal in ${PlannerModule.DAY_LABELS[targetDay]} ${PlannerModule.SLOT_LABELS[targetSlot]}! 🍱`, 'success');
    });

    openModal(DOM.assignModal);
  }

  /**
   * Add/Edit Recipe Modal with Dynamic Rows
   */
  function openRecipeEditModal(recipeToEdit = null) {
    if (!DOM.recipeEditModal) return;

    const isEdit = !!recipeToEdit;
    const modalBody = DOM.recipeEditModal.querySelector('.modal-body-content');

    const aisles = UnitsModule.getConfig().aisles || ['Produce', 'Dairy & Eggs', 'Meat & Seafood', 'Pantry & Grains', 'Other'];

    let initialIngredients = recipeToEdit?.ingredients || [
      { name: '', quantity: 1, unit: 'piece', aisle: 'Produce' }
    ];

    modalBody.innerHTML = `
      <h3>${isEdit ? 'Edit Recipe' : 'Add New Recipe'}</h3>
      <form id="recipe-editor-form">
        <div class="form-row-2">
          <div class="form-group">
            <label for="recipe-edit-name">Recipe Name *</label>
            <input type="text" id="recipe-edit-name" class="form-control" value="${recipeToEdit?.name || ''}" required placeholder="e.g. Garden Veggie Frittata" />
          </div>
          <div class="form-group">
            <label for="recipe-edit-image">Image URL</label>
            <input type="url" id="recipe-edit-image" class="form-control" value="${recipeToEdit?.image || ''}" placeholder="https://..." />
          </div>
        </div>

        <div class="form-row-3">
          <div class="form-group">
            <label for="recipe-edit-servings">Servings *</label>
            <input type="number" id="recipe-edit-servings" class="form-control" min="1" max="50" value="${recipeToEdit?.servings || 4}" required />
          </div>
          <div class="form-group">
            <label for="recipe-edit-prep">Prep Time (min)</label>
            <input type="number" id="recipe-edit-prep" class="form-control" min="0" value="${recipeToEdit?.prepTime || 15}" />
          </div>
          <div class="form-group">
            <label for="recipe-edit-cook">Cook Time (min)</label>
            <input type="number" id="recipe-edit-cook" class="form-control" min="0" value="${recipeToEdit?.cookTime || 20}" />
          </div>
        </div>

        <div class="form-group">
          <label for="recipe-edit-tags">Tags (comma-separated)</label>
          <input type="text" id="recipe-edit-tags" class="form-control" value="${(recipeToEdit?.tags || ['Dinner']).join(', ')}" placeholder="Quick, Vegetarian, High-Protein" />
        </div>

        <div class="form-group">
          <label for="recipe-edit-desc">Description</label>
          <textarea id="recipe-edit-desc" class="form-control" rows="2" placeholder="Brief summary of this dish...">${recipeToEdit?.description || ''}</textarea>
        </div>

        <div class="recipe-form-ingredients-section">
          <div class="section-header-row">
            <h4>Ingredients</h4>
            <button type="button" class="btn btn-sm btn-outline" id="btn-add-ingredient-row">+ Add Ingredient</button>
          </div>
          <div id="dynamic-ingredients-container">
            <!-- Dynamic rows injected here -->
          </div>
        </div>

        <div class="form-group">
          <label for="recipe-edit-instructions">Instructions (one step per line)</label>
          <textarea id="recipe-edit-instructions" class="form-control" rows="4" placeholder="1. Chop vegetables...&#10;2. Heat oil in skillet...">${(recipeToEdit?.instructions || []).join('\n')}</textarea>
        </div>

        <div class="modal-actions-row">
          <button type="button" class="btn btn-outline modal-close-btn">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Recipe</button>
        </div>
      </form>
    `;

    const ingredientsContainer = modalBody.querySelector('#dynamic-ingredients-container');

    function renderDynamicRow(ing = {}) {
      const row = document.createElement('div');
      row.className = 'ingredient-edit-row';
      row.innerHTML = `
        <input type="number" step="any" min="0" class="form-control ing-input-qty" placeholder="Qty" value="${ing.quantity || 1}" style="width: 80px;" required />
        <select class="form-control ing-input-unit" style="width: 110px;">
          <option value="g" ${ing.unit === 'g' ? 'selected' : ''}>g</option>
          <option value="kg" ${ing.unit === 'kg' ? 'selected' : ''}>kg</option>
          <option value="ml" ${ing.unit === 'ml' ? 'selected' : ''}>ml</option>
          <option value="l" ${ing.unit === 'l' ? 'selected' : ''}>L</option>
          <option value="cup" ${ing.unit === 'cup' ? 'selected' : ''}>cup</option>
          <option value="tbsp" ${ing.unit === 'tbsp' ? 'selected' : ''}>tbsp</option>
          <option value="tsp" ${ing.unit === 'tsp' ? 'selected' : ''}>tsp</option>
          <option value="piece" ${ing.unit === 'piece' ? 'selected' : ''}>piece</option>
          <option value="cloves" ${ing.unit === 'cloves' ? 'selected' : ''}>cloves</option>
          <option value="slices" ${ing.unit === 'slices' ? 'selected' : ''}>slices</option>
          <option value="can" ${ing.unit === 'can' ? 'selected' : ''}>can</option>
          <option value="bunch" ${ing.unit === 'bunch' ? 'selected' : ''}>bunch</option>
        </select>
        <input type="text" list="pantry-suggestions" class="form-control ing-input-name" placeholder="Ingredient name (e.g. spinach)" value="${ing.name || ''}" required style="flex: 2;" />
        <select class="form-control ing-input-aisle" style="flex: 1.5;">
          ${aisles.map(a => `<option value="${a}" ${ing.aisle === a ? 'selected' : ''}>${a}</option>`).join('')}
        </select>
        <button type="button" class="btn-icon-subtle btn-remove-row" title="Remove ingredient">✕</button>
      `;

      row.querySelector('.btn-remove-row').addEventListener('click', () => {
        if (ingredientsContainer.children.length > 1) {
          row.remove();
        }
      });

      // Auto guess aisle when typing name
      const nameInput = row.querySelector('.ing-input-name');
      const aisleSelect = row.querySelector('.ing-input-aisle');
      nameInput.addEventListener('blur', () => {
        if (nameInput.value && (!ing.aisle || ing.aisle === 'Produce')) {
          aisleSelect.value = ParseIngredientModule.guessAisle(nameInput.value);
        }
      });

      ingredientsContainer.appendChild(row);
    }

    initialIngredients.forEach(renderDynamicRow);

    modalBody.querySelector('#btn-add-ingredient-row').addEventListener('click', () => {
      renderDynamicRow({ quantity: 1, unit: 'piece', name: '', aisle: 'Produce' });
    });

    modalBody.querySelector('.modal-close-btn').addEventListener('click', closeAllModals);

    modalBody.querySelector('#recipe-editor-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target;

      const name = form['recipe-edit-name'].value.trim();
      const image = form['recipe-edit-image'].value.trim();
      const servings = parseInt(form['recipe-edit-servings'].value, 10) || 2;
      const prepTime = parseInt(form['recipe-edit-prep'].value, 10) || 10;
      const cookTime = parseInt(form['recipe-edit-cook'].value, 10) || 15;
      const tags = form['recipe-edit-tags'].value.split(',').map(t => t.trim()).filter(Boolean);
      const description = form['recipe-edit-desc'].value.trim();
      const instructions = form['recipe-edit-instructions'].value.split('\n').map(s => s.trim()).filter(Boolean);

      const ingredients = [];
      ingredientsContainer.querySelectorAll('.ingredient-edit-row').forEach(r => {
        const qty = parseFloat(r.querySelector('.ing-input-qty').value) || 1;
        const unit = r.querySelector('.ing-input-unit').value;
        const ingName = r.querySelector('.ing-input-name').value.trim();
        const aisle = r.querySelector('.ing-input-aisle').value;

        if (ingName) {
          ingredients.push({
            name: ingName,
            quantity: qty,
            unit: unit,
            aisle: aisle,
            raw: `${qty} ${unit} ${ingName}`
          });
        }
      });

      if (ingredients.length === 0) {
        alert('Please add at least one ingredient');
        return;
      }

      if (isEdit) {
        const idx = STATE.recipes.findIndex(r => r.id === recipeToEdit.id);
        if (idx !== -1) {
          STATE.recipes[idx] = {
            ...STATE.recipes[idx],
            name, image, servings, prepTime, cookTime, tags, description, instructions, ingredients
          };
        }
      } else {
        const newRecipe = {
          id: 'recipe-' + Date.now(),
          name,
          image: image || 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=600&q=80',
          emoji: '🍲',
          servings,
          prepTime,
          cookTime,
          tags,
          description,
          instructions,
          ingredients,
          nutritionPerServing: {
            calories: 380,
            protein: 18,
            carbs: 45,
            fat: 14
          }
        };
        STATE.recipes.unshift(newRecipe);
      }

      saveRecipes();
      closeAllModals();
      renderRecipesGrid();
      showToast(`Saved recipe "${name}"!`, 'success');
    });

    openModal(DOM.recipeEditModal);
  }

  /**
   * Import Recipe Modal (Pasted free-text or JSON)
   */
  function openImportModal() {
    if (!DOM.importModal) return;

    const modalBody = DOM.importModal.querySelector('.modal-body-content');
    modalBody.innerHTML = `
      <h3>Import Recipe</h3>
      <div class="import-tabs-header">
        <button class="btn btn-sm btn-outline active" id="import-tab-btn-text">Paste Text / Ingredients</button>
        <button class="btn btn-sm btn-outline" id="import-tab-btn-json">JSON File / Data</button>
      </div>

      <div id="import-pane-text" class="import-pane active">
        <div class="form-group">
          <label for="import-text-name">Recipe Name</label>
          <input type="text" id="import-text-name" class="form-control" placeholder="e.g. Grandma's Veggie Soup" required />
        </div>
        <div class="form-group">
          <label for="import-text-ingredients">Paste Ingredients (one per line, e.g. "1 1/2 cups flour"):</label>
          <textarea id="import-text-ingredients" class="form-control" rows="6" placeholder="2 tbsp olive oil&#10;1 1/2 cups rolled oats&#10;4 cloves garlic, minced&#10;500g chicken breast"></textarea>
        </div>
        <div class="form-group">
          <label for="import-text-instructions">Instructions (optional):</label>
          <textarea id="import-text-instructions" class="form-control" rows="3" placeholder="Step 1...&#10;Step 2..."></textarea>
        </div>
        <button class="btn btn-primary" id="btn-submit-import-text">Parse & Import Recipe</button>
      </div>

      <div id="import-pane-json" class="import-pane" style="display: none;">
        <div class="form-group">
          <label for="import-file-input">Choose JSON File:</label>
          <input type="file" id="import-file-input" accept=".json,application/json" class="form-control" />
        </div>
        <div class="form-group">
          <label for="import-raw-json">Or Paste JSON Data:</label>
          <textarea id="import-raw-json" class="form-control" rows="8" placeholder='{ "name": "...", "ingredients": [...] }'></textarea>
        </div>
        <button class="btn btn-primary" id="btn-submit-import-json">Import JSON</button>
      </div>

      <div class="modal-actions-row">
        <button type="button" class="btn btn-outline modal-close-btn">Cancel</button>
      </div>
    `;

    // Tab switching
    const btnText = modalBody.querySelector('#import-tab-btn-text');
    const btnJson = modalBody.querySelector('#import-tab-btn-json');
    const paneText = modalBody.querySelector('#import-pane-text');
    const paneJson = modalBody.querySelector('#import-pane-json');

    btnText.addEventListener('click', () => {
      btnText.classList.add('active');
      btnJson.classList.remove('active');
      paneText.style.display = 'block';
      paneJson.style.display = 'none';
    });

    btnJson.addEventListener('click', () => {
      btnJson.classList.add('active');
      btnText.classList.remove('active');
      paneJson.style.display = 'block';
      paneText.style.display = 'none';
    });

    modalBody.querySelector('.modal-close-btn').addEventListener('click', closeAllModals);

    // Free text import logic
    modalBody.querySelector('#btn-submit-import-text').addEventListener('click', () => {
      const name = modalBody.querySelector('#import-text-name').value.trim() || 'Imported Recipe';
      const rawText = modalBody.querySelector('#import-text-ingredients').value;
      const rawInst = modalBody.querySelector('#import-text-instructions').value;

      if (!rawText.trim()) {
        alert('Please enter ingredients to import');
        return;
      }

      const parsedIngredients = ParseIngredientModule.parseIngredientBlock(rawText);

      const newRecipe = {
        id: 'recipe-' + Date.now(),
        name,
        image: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=600&q=80',
        emoji: '📖',
        servings: 4,
        prepTime: 10,
        cookTime: 20,
        tags: ['Custom', 'Imported'],
        description: `Imported with ${parsedIngredients.length} parsed ingredients.`,
        ingredients: parsedIngredients,
        instructions: rawInst.split('\n').map(s => s.trim()).filter(Boolean),
        nutritionPerServing: { calories: 350, protein: 15, carbs: 40, fat: 12 }
      };

      STATE.recipes.unshift(newRecipe);
      saveRecipes();
      closeAllModals();
      renderRecipesGrid();
      showToast(`Successfully parsed and imported "${name}" with ${parsedIngredients.length} ingredients! 🎉`, 'success');
    });

    // File input handler
    const fileInput = modalBody.querySelector('#import-file-input');
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        modalBody.querySelector('#import-raw-json').value = evt.target.result;
      };
      reader.readAsText(file);
    });

    // JSON import logic
    modalBody.querySelector('#btn-submit-import-json').addEventListener('click', () => {
      const rawJson = modalBody.querySelector('#import-raw-json').value;
      if (!rawJson.trim()) return;

      try {
        const parsed = JSON.parse(rawJson);
        const importedList = Array.isArray(parsed) ? parsed : [parsed];

        let count = 0;
        importedList.forEach(item => {
          if (item && item.name && item.ingredients) {
            item.id = item.id || ('recipe-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4));
            STATE.recipes.unshift(item);
            count++;
          }
        });

        saveRecipes();
        closeAllModals();
        renderRecipesGrid();
        showToast(`Imported ${count} recipe(s) successfully! 🚀`, 'success');
      } catch (err) {
        alert('Invalid JSON format: ' + err.message);
      }
    });

    openModal(DOM.importModal);
  }

  function exportRecipesToJson() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(STATE.recipes, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', dataStr);
    dlAnchorElem.setAttribute('download', `recipes-backup-${new Date().toISOString().split('T')[0]}.json`);
    dlAnchorElem.click();
    showToast('Exported recipes to JSON file! 💾', 'success');
  }

  /**
   * Household Modal Management
   */
  function openHouseholdsModal() {
    if (!DOM.householdsModal) return;

    const modalBody = DOM.householdsModal.querySelector('.modal-body-content');
    modalBody.innerHTML = `
      <h3>Manage Pantries & Households</h3>
      <p class="text-muted">Maintain separate pantries and meal plans for different spaces (e.g. Home, Dorm, Office).</p>
      
      <div class="households-list">
        ${STATE.households.map(h => `
          <div class="household-list-item ${h.id === STATE.currentHousehold ? 'is-active-household' : ''}">
            <div class="household-info">
              <strong>${h.name}</strong>
              ${h.id === STATE.currentHousehold ? '<span class="badge badge-primary">Active</span>' : ''}
            </div>
            <div class="household-actions">
              ${h.id !== STATE.currentHousehold ? `
                <button class="btn btn-sm btn-outline btn-select-hh" data-id="${h.id}">Switch To</button>
              ` : ''}
              ${STATE.households.length > 1 ? `
                <button class="btn-icon-subtle btn-delete-hh" data-id="${h.id}" title="Delete household">🗑️</button>
              ` : ''}
            </div>
          </div>
        `).join('')}
      </div>

      <div class="add-household-box">
        <h4>Create New Household / Pantry</h4>
        <form id="create-household-form" class="form-row-inline">
          <input type="text" id="new-household-name" class="form-control" placeholder="e.g. 🏖️ Vacation Beach House" required />
          <button type="submit" class="btn btn-primary">+ Add</button>
        </form>
      </div>

      <div class="modal-actions-row">
        <button type="button" class="btn btn-outline modal-close-btn">Close</button>
      </div>
    `;

    modalBody.querySelector('.modal-close-btn').addEventListener('click', closeAllModals);

    modalBody.querySelectorAll('.btn-select-hh').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        closeAllModals();
        switchHousehold(id);
      });
    });

    modalBody.querySelectorAll('.btn-delete-hh').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (confirm(`Are you sure you want to delete this household?`)) {
          STATE.households = STATE.households.filter(h => h.id !== id);
          localStorage.setItem('pmp_v1_households', JSON.stringify(STATE.households));
          if (STATE.currentHousehold === id) {
            STATE.currentHousehold = STATE.households[0].id;
          }
          openHouseholdsModal();
          switchHousehold(STATE.currentHousehold);
        }
      });
    });

    modalBody.querySelector('#create-household-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = modalBody.querySelector('#new-household-name').value.trim();
      if (!name) return;

      const newId = 'household-' + Date.now();
      STATE.households.push({ id: newId, name });
      localStorage.setItem('pmp_v1_households', JSON.stringify(STATE.households));
      openHouseholdsModal();
      showToast(`Created new household "${name}"!`, 'success');
      switchHousehold(newId);
    });

    openModal(DOM.householdsModal);
  }

  /**
   * Modal Display Helpers
   */
  function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add('is-open');
    modalEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-backdrop-open');
  }

  function closeAllModals() {
    document.querySelectorAll('.modal-wrapper').forEach(m => {
      m.classList.remove('is-open');
      m.setAttribute('aria-hidden', 'true');
    });
    document.body.classList.remove('modal-backdrop-open');
  }

  /**
   * Drag and Drop Event Handlers
   */
  function handleRecipeDroppedOnSlot(day, slot, recipeId) {
    const recipe = STATE.recipes.find(r => r.id === recipeId);
    if (!recipe) return;

    PlannerModule.addMeal(day, slot, recipe, recipe.servings || 2);
    renderPlannerGrid();
    renderShoppingList();
    showToast(`Added "${recipe.name}" to ${PlannerModule.DAY_LABELS[day]} ${PlannerModule.SLOT_LABELS[slot]}!`, 'success');
  }

  function handleMealRescheduled(sourceDay, sourceSlot, mealId, targetDay, targetSlot) {
    const moved = PlannerModule.moveMeal(sourceDay, sourceSlot, mealId, targetDay, targetSlot);
    if (moved) {
      renderPlannerGrid();
      renderShoppingList();
      showToast(`Rescheduled to ${PlannerModule.DAY_LABELS[targetDay]} ${PlannerModule.SLOT_LABELS[targetSlot]}`, 'info');
    }
  }

  /**
   * Interactive Toast Notification System with Undo
   */
  function showToast(message, type = 'info', options = {}) {
    if (!DOM.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;

    let actionBtnHtml = '';
    if (options.actionLabel && typeof options.onAction === 'function') {
      actionBtnHtml = `<button class="toast-action-btn">${options.actionLabel}</button>`;
    }

    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-icon">${type === 'success' ? '✓' : (type === 'error' ? '⚠️' : 'ℹ️')}</span>
        <span class="toast-msg">${message}</span>
      </div>
      ${actionBtnHtml}
      <button class="toast-close" title="Dismiss">✕</button>
    `;

    if (actionBtnHtml) {
      toast.querySelector('.toast-action-btn').addEventListener('click', () => {
        options.onAction();
        toast.remove();
      });
    }

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
    });

    DOM.toastContainer.appendChild(toast);

    // Auto dismiss after 5 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.add('toast-fade-out');
        setTimeout(() => toast.remove(), 300);
      }
    }, 5000);
  }

  /**
   * Utility debounce helper
   */
  function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // Expose global app object for inline handlers and debugging
  window.AntigravityApp = {
    init: initApp,
    setActiveTab,
    openRecipeEditModal,
    openImportModal,
    openHouseholdsModal,
    showToast,
    STATE
  };

  // Run on DOM content loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
