"use client";

import { useRef, type ComponentPropsWithoutRef, type PointerEvent } from "react";

interface Gesture {
  pointerId: number;
  x: number;
  scrollLeft: number;
  dragging: boolean;
  snap: string;
  behavior: string;
}

/** A native horizontal list with mouse dragging; touch and keyboard retain native behavior. */
export function DragScroll({ children, className = "", ...props }: ComponentPropsWithoutRef<"ul">) {
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);

  const finish = (event: PointerEvent<HTMLUListElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    gesture.current = null;
    const row = event.currentTarget;
    if (active.dragging) {
      row.style.scrollSnapType = active.snap;
      row.style.scrollBehavior = active.behavior;
      delete row.dataset.dragging;
      if (row.hasPointerCapture(active.pointerId)) row.releasePointerCapture(active.pointerId);
    }
  };

  return (
    <ul
      {...props}
      className={`drag-scroll select-none ${className}`}
      onPointerDown={(event) => {
        suppressClick.current = false;
        const row = event.currentTarget;
        if (event.pointerType !== "mouse" || event.button !== 0 || !event.isPrimary || row.scrollWidth <= row.clientWidth) return;
        gesture.current = {
          pointerId: event.pointerId, x: event.clientX, scrollLeft: row.scrollLeft, dragging: false,
          snap: row.style.scrollSnapType, behavior: row.style.scrollBehavior,
        };
      }}
      onPointerMove={(event) => {
        const active = gesture.current;
        if (!active || active.pointerId !== event.pointerId) return;
        if (!(event.buttons & 1)) { finish(event); return; }
        const distance = event.clientX - active.x;
        if (!active.dragging && Math.abs(distance) < 6) return;
        const row = event.currentTarget;
        if (!active.dragging) {
          active.dragging = true;
          suppressClick.current = true;
          row.style.scrollSnapType = "none";
          row.style.scrollBehavior = "auto";
          row.dataset.dragging = "true";
          row.setPointerCapture(event.pointerId);
        }
        event.preventDefault();
        row.scrollLeft = active.scrollLeft - distance;
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onPointerLeave={(event) => { if (!gesture.current?.dragging) finish(event); }}
      onDragStart={(event) => event.preventDefault()}
      onClickCapture={(event) => {
        if (!suppressClick.current || event.detail === 0) return;
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {children}
    </ul>
  );
}
