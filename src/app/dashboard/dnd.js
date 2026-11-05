import { useSensor, useSensors, MouseSensor, TouchSensor, KeyboardSensor } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

/** Keep a drag on one axis. */
export const lockY = ({ transform }) => ({ ...transform, x: 0 });
export const lockX = ({ transform }) => ({ ...transform, y: 0 });

/**
 * Sensors for sortable lists. A small movement threshold lets plain clicks
 * through; touch needs a short press so scrolling still works. Keyboard
 * dragging (Space to lift, arrows to move) is optional because it would
 * clash with Enter/Space on buttons that are themselves the drag target.
 */
export function useSortSensors({ keyboard = false } = {}) {
    const mouse = useSensor(MouseSensor, { activationConstraint: { distance: 6 } });
    const touch = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } });
    const kb = useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates });
    return useSensors(...(keyboard ? [mouse, touch, kb] : [mouse, touch]));
}
