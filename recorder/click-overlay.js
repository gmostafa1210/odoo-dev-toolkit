// Draws a short ring wherever the user clicks in the recorded tab, so
// viewers can follow the actions. It never draws a mouse pointer: the
// real pointer recorded by Chrome is the only one in the video.

export function installClickOverlay() {
  if (window.__otkClicks) return true;
  const PLUM = "113, 75, 103";

  const root = document.createElement("div");
  root.setAttribute("data-otk-clicks", "");
  root.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:2147483647;overflow:hidden;contain:strict;";

  const mount = () => {
    if (!root.isConnected || root !== document.documentElement.lastElementChild) {
      document.documentElement.appendChild(root);
    }
  };
  mount();

  const onDown = (e) => {
    const size = 44;
    const ring = document.createElement("div");
    ring.style.cssText =
      `position:absolute;left:${e.clientX - size / 2}px;top:${e.clientY - size / 2}px;` +
      `width:${size}px;height:${size}px;border-radius:50%;box-sizing:border-box;` +
      `border:3px solid rgba(${PLUM}, .95);background:rgba(${PLUM}, .22);`;
    root.appendChild(ring);
    ring
      .animate(
        [
          { transform: "scale(.35)", opacity: 1 },
          { transform: "scale(1)", opacity: 0.85, offset: 0.45 },
          { transform: "scale(1.25)", opacity: 0 },
        ],
        { duration: 650, easing: "ease-out" }
      )
      .finished.then(() => ring.remove(), () => ring.remove());
  };

  // Keep the overlay above elements added later (dialogs, dropdowns).
  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true });

  const opts = { capture: true, passive: true };
  addEventListener("pointerdown", onDown, opts);

  window.__otkClicks = {
    remove() {
      observer.disconnect();
      removeEventListener("pointerdown", onDown, opts);
      root.remove();
      delete window.__otkClicks;
    },
  };
  return true;
}

export function removeClickOverlay() {
  window.__otkClicks?.remove();
  return true;
}
