"use client";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

export default function Modal({
  title,
  description,
  onClose,
  children,
  wide = false,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  const historyActive = useRef(false);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const target = ref.current;
    const focusable = () => [
      ...target.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
      ),
    ];
    (
      target.querySelector("[data-autofocus]") ||
      focusable()[0] ||
      target
    ).focus();
    function onKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key === "Tab") {
        const items = focusable();
        const first = items[0];
        const last = items[items.length - 1];
        if (!items.length) {
          event.preventDefault();
          target.focus();
        } else if (
          event.shiftKey &&
          (document.activeElement === first ||
            !target.contains(document.activeElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !target.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    history.pushState({ reelbagOverlay: true }, "");
    historyActive.current = true;
    function onPopState() {
      if (!historyActive.current) return;
      historyActive.current = false;
      closeRef.current();
    }
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      if (historyActive.current) {
        historyActive.current = false;
        history.back();
      }
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`modal ${wide ? "modal-wide" : ""}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-xl font-semibold tracking-tight">
              {title}
            </h2>
            {description && (
              <p
                id={descriptionId}
                className="mt-2 text-sm leading-relaxed text-zinc-400"
              >
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-button shrink-0"
            aria-label="Close dialog"
          >
            <X size={19} />
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </section>
    </div>
  );
}
