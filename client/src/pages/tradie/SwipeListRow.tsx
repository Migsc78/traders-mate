import { useRef, useState, type ReactNode, type TouchEvent } from "react";
import { Link } from "react-router-dom";

const ARCHIVE_THRESHOLD = 72;
const DELETE_THRESHOLD = -72;
const MAX_SLIDE = 96;

type SwipeListRowProps = {
  children: ReactNode;
  to: string;
  linkState?: unknown;
  onArchive: () => void;
  onDelete: () => void;
  /**
   * Locks *this* row only. Deliberately not wired to a shared "a mutation is in
   * flight" flag: doing that meant one slow or stalled write froze every row on
   * the screen, which is how a single hung offline queue write made swiping look
   * like it only worked once. The row is removed from the list optimistically,
   * so nothing needs a global lock to stop it being swiped twice.
   */
  busy?: boolean;
};

/** Mail-style swipe: right = archive, left = delete. */
export function SwipeListRow({
  children,
  to,
  linkState,
  onArchive,
  onDelete,
  busy = false,
}: SwipeListRowProps) {
  const startX = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const locked = useRef<"h" | "v" | null>(null);
  const [dx, setDx] = useState(0);
  const [animating, setAnimating] = useState(false);

  const reset = (next = 0) => {
    setAnimating(true);
    setDx(next);
    window.setTimeout(() => setAnimating(false), 180);
  };

  const onTouchStart = (e: TouchEvent) => {
    if (busy) return;
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
    dragging.current = true;
    locked.current = null;
    setAnimating(false);
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!dragging.current || busy) return;
    const t = e.touches[0];
    const rawX = t.clientX - startX.current;
    const rawY = t.clientY - startY.current;
    if (!locked.current) {
      if (Math.abs(rawX) < 8 && Math.abs(rawY) < 8) return;
      locked.current = Math.abs(rawX) > Math.abs(rawY) ? "h" : "v";
      if (locked.current === "v") {
        dragging.current = false;
        return;
      }
    }
    if (locked.current !== "h") return;
    setDx(Math.max(-MAX_SLIDE, Math.min(MAX_SLIDE, rawX)));
  };

  const onTouchEnd = () => {
    if (!dragging.current) {
      reset(0);
      return;
    }
    dragging.current = false;
    if (dx >= ARCHIVE_THRESHOLD) {
      reset(MAX_SLIDE);
      onArchive();
      window.setTimeout(() => reset(0), 220);
      return;
    }
    if (dx <= DELETE_THRESHOLD) {
      reset(-MAX_SLIDE);
      onDelete();
      window.setTimeout(() => reset(0), 220);
      return;
    }
    reset(0);
  };

  return (
    <li className="t-swipe">
      <div className="t-swipe-under" aria-hidden="true">
        <span className={`t-swipe-action t-swipe-action--archive ${dx > 24 ? "show" : ""}`}>Archive</span>
        <span className={`t-swipe-action t-swipe-action--delete ${dx < -24 ? "show" : ""}`}>Delete</span>
      </div>
      <div
        className={`t-swipe-front${animating ? " t-swipe-front--anim" : ""}`}
        style={{ transform: `translateX(${dx}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          dragging.current = false;
          reset(0);
        }}
      >
        <Link
          className="t-row"
          to={to}
          state={linkState}
          onClick={(e) => {
            if (Math.abs(dx) > 12) e.preventDefault();
          }}
          draggable={false}
        >
          {children}
        </Link>
      </div>
    </li>
  );
}
