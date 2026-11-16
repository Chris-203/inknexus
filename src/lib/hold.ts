import { useRef, type PointerEvent } from 'react';
import { pastSlop } from './swipe';

/** How long a finger stays down before the press is a hold, in ms. */
const HOLD = 500;

/**
 * Tells a hold from a tap on anything pressed. `start` goes on pointer down with what a hold does, `move` on pointer
 * move, and `end` wherever the press ends. The click that ends a hold is not a tap: `took()` says so, once.
 */
export function useHold() {
  const timer = useRef(0);
  const at = useRef({ x: 0, y: 0 });
  const held = useRef(false);
  const end = () => clearTimeout(timer.current);
  return {
    start(e: PointerEvent<HTMLElement>, onHold: (el: HTMLElement) => void) {
      const el = e.currentTarget;
      held.current = false;
      at.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        held.current = true;
        onHold(el);
      }, HOLD);
    },
    // A swipe between shelves keeps the pointer, and the card moves along under it, so moving the finger at all ends the hold.
    move(e: PointerEvent) {
      if (pastSlop(e.clientX - at.current.x, e.clientY - at.current.y)) end();
    },
    end,
    took() {
      const was = held.current;
      held.current = false;
      return was;
    },
  };
}
