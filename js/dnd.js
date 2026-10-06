/**
 * dnd.js - Drag and Drop API implementation with accessible alternatives
 * Pantry Meal Planner & Grocery Consolidator
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DndModule = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  let onDropCallback = null;
  let onRescheduleCallback = null;
  let draggedData = null;

  /**
   * Initialize Drag and Drop handlers
   */
  function init(options = {}) {
    onDropCallback = options.onDrop || null;
    onRescheduleCallback = options.onReschedule || null;

    setupGlobalDragListeners();
  }

  /**
   * Setup global dragend and dragover listeners to clean up highlights
   */
  function setupGlobalDragListeners() {
    document.addEventListener('dragend', () => {
      document.querySelectorAll('.drop-target-active, .drag-over').forEach(el => {
        el.classList.remove('drop-target-active', 'drag-over');
      });
      draggedData = null;
    });
  }

  /**
   * Make an element draggable as a Recipe
   */
  function makeRecipeDraggable(element, recipe) {
    element.setAttribute('draggable', 'true');

    element.addEventListener('dragstart', (e) => {
      draggedData = {
        type: 'recipe',
        recipeId: recipe.id,
        recipeName: recipe.name
      };

      e.dataTransfer.effectAllowed = 'copyMove';
      e.dataTransfer.setData('application/json', JSON.stringify(draggedData));
      element.classList.add('is-dragging');

      // Highlight all valid drop zones
      document.querySelectorAll('.planner-slot-cell').forEach(cell => {
        cell.classList.add('drop-target-active');
      });
    });

    element.addEventListener('dragend', () => {
      element.classList.remove('is-dragging');
      document.querySelectorAll('.drop-target-active, .drag-over').forEach(cell => {
        cell.classList.remove('drop-target-active', 'drag-over');
      });
      draggedData = null;
    });
  }

  /**
   * Make a scheduled meal card draggable to allow rescheduling
   */
  function makeMealDraggable(element, meal, day, slot) {
    element.setAttribute('draggable', 'true');

    element.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      draggedData = {
        type: 'scheduled_meal',
        mealId: meal.id,
        mealName: meal.name,
        sourceDay: day,
        sourceSlot: slot
      };

      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/json', JSON.stringify(draggedData));
      element.classList.add('is-dragging');

      // Highlight other drop zones
      document.querySelectorAll('.planner-slot-cell').forEach(cell => {
        cell.classList.add('drop-target-active');
      });
    });

    element.addEventListener('dragend', (e) => {
      e.stopPropagation();
      element.classList.remove('is-dragging');
      document.querySelectorAll('.drop-target-active, .drag-over').forEach(cell => {
        cell.classList.remove('drop-target-active', 'drag-over');
      });
      draggedData = null;
    });
  }

  /**
   * Setup a table cell as a drop zone for meals
   */
  function setupDropZone(cellElement, day, slot) {
    cellElement.setAttribute('data-day', day);
    cellElement.setAttribute('data-slot', slot);

    cellElement.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (!cellElement.classList.contains('drag-over')) {
        cellElement.classList.add('drag-over');
      }
    });

    cellElement.addEventListener('dragleave', (e) => {
      // Avoid flickering when hovering over children
      if (!cellElement.contains(e.relatedTarget)) {
        cellElement.classList.remove('drag-over');
      }
    });

    cellElement.addEventListener('drop', (e) => {
      e.preventDefault();
      cellElement.classList.remove('drag-over');
      document.querySelectorAll('.drop-target-active').forEach(c => c.classList.remove('drop-target-active'));

      let data = draggedData;
      if (!data) {
        try {
          const raw = e.dataTransfer.getData('application/json');
          if (raw) data = JSON.parse(raw);
        } catch (err) {
          console.error('Failed to parse drag transfer data:', err);
        }
      }

      if (!data) return;

      if (data.type === 'recipe' && onDropCallback) {
        onDropCallback(day, slot, data.recipeId);
      } else if (data.type === 'scheduled_meal' && onRescheduleCallback) {
        onRescheduleCallback(data.sourceDay, data.sourceSlot, data.mealId, day, slot);
      }
    });
  }

  return {
    init,
    makeRecipeDraggable,
    makeMealDraggable,
    setupDropZone
  };
});
