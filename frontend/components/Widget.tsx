"use client";
import { type ReactNode } from "react";
import { GripHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  controls?: ReactNode;
  onRemove?: () => void;
  /** Drag-to-swap callbacks */
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDrop: (id: string) => void;
  isDragOver?: boolean;
  /** When true the title bar is a slim strip only (chat uses its own header) */
  slim?: boolean;
}

export default function Widget({
  id,
  title,
  icon,
  children,
  controls,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver,
  slim,
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-col h-full rounded-xl border bg-card shadow-md overflow-hidden transition-colors duration-150",
        isDragOver ? "border-primary ring-2 ring-primary/30" : "border-border",
      )}
      onDragOver={(e) => { e.preventDefault(); onDragOver(id); }}
      onDrop={(e) => { e.preventDefault(); onDrop(id); }}
    >
      {slim ? (
        /* 6 px strip — enough to grab, chat uses its own header below */
        <div
          draggable
          onDragStart={() => onDragStart(id)}
          className="h-1.5 shrink-0 cursor-grab active:cursor-grabbing bg-muted/60 hover:bg-primary/30 transition-colors"
        />
      ) : (
        <div
          draggable
          onDragStart={() => onDragStart(id)}
          className={cn(
            "flex items-center justify-between px-3 py-2 border-b border-border shrink-0 select-none",
            "bg-muted/40 cursor-grab active:cursor-grabbing",
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            {icon && <span className="text-primary shrink-0">{icon}</span>}
            <span className="text-sm font-semibold truncate">{title}</span>
            <GripHorizontal size={12} className="text-muted-foreground/30 shrink-0" />
          </div>
          <div className="flex items-center gap-1 shrink-0" onMouseDown={(e) => e.stopPropagation()}>
            {controls}
            {onRemove && (
              <button onClick={onRemove}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
