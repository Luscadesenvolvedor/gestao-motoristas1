import { useEffect, useRef } from 'react';

// Injeta CSS uma única vez para toda a aplicação
let cssInjected = false;
function injectCSS() {
  if (cssInjected) return;
  cssInjected = true;
  const s = document.createElement('style');
  s.textContent = '.sst-wrap{overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none}.sst-wrap::-webkit-scrollbar{display:none}';
  document.head.appendChild(s);
}

export default function StickyScrollTable({ children, deps = [] }) {
  const wrapperRef = useRef(null);
  const mirrorRef = useRef(null);
  const spacerRef = useRef(null);
  const syncing = useRef(false);

  useEffect(() => { injectCSS(); }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const mirror = mirrorRef.current;
    const spacer = spacerRef.current;
    if (!wrapper || !mirror || !spacer) return;

    let alive = true;

    function update() {
      if (!alive) return;
      const table = wrapper.querySelector('table');
      const contentW = table ? table.scrollWidth : wrapper.scrollWidth;
      spacer.style.width = contentW + 'px';

      const rect = wrapper.getBoundingClientRect();
      const vh = window.innerHeight;
      const show = rect.top < vh && rect.bottom > vh;

      mirror.style.display = show ? 'block' : 'none';
      mirror.style.left = rect.left + 'px';
      mirror.style.width = rect.width + 'px';
    }

    function onWrapper() {
      if (syncing.current) return;
      syncing.current = true;
      mirror.scrollLeft = wrapper.scrollLeft;
      syncing.current = false;
    }

    function onMirror() {
      if (syncing.current) return;
      syncing.current = true;
      wrapper.scrollLeft = mirror.scrollLeft;
      syncing.current = false;
    }

    const ro = new ResizeObserver(update);
    ro.observe(wrapper);
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    wrapper.addEventListener('scroll', onWrapper, { passive: true });
    mirror.addEventListener('scroll', onMirror, { passive: true });
    update();

    return () => {
      alive = false;
      ro.disconnect();
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      wrapper.removeEventListener('scroll', onWrapper);
      mirror.removeEventListener('scroll', onMirror);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return (
    <>
      <div ref={wrapperRef} className="sst-wrap">
        {children}
      </div>
      {/* Mirror sempre renderizado (display none/block via JS) */}
      <div
        ref={mirrorRef}
        style={{
          position: 'fixed',
          bottom: 0,
          height: 14,
          overflowX: 'auto',
          overflowY: 'hidden',
          zIndex: 50,
          display: 'none',
        }}
      >
        <div ref={spacerRef} style={{ height: 1 }} />
      </div>
    </>
  );
}
