import { useEffect, useRef } from 'react';

let cssInjected = false;
function injectCSS() {
  if (cssInjected) return;
  cssInjected = true;
  const s = document.createElement('style');
  s.textContent = '.sst-wrap{overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none}.sst-wrap::-webkit-scrollbar{display:none}';
  document.head.appendChild(s);
}

function getScrollParent(el) {
  while (el && el !== document.body) {
    const { overflow, overflowY, overflowX } = window.getComputedStyle(el);
    if (/(auto|scroll)/.test(overflow + overflowY + overflowX)) return el;
    el = el.parentElement;
  }
  return window;
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
    const scrollParent = getScrollParent(wrapper.parentElement);

    function update() {
      if (!alive) return;
      const table = wrapper.querySelector('table');
      const contentW = table ? table.scrollWidth : wrapper.scrollWidth;
      spacer.style.width = contentW + 'px';

      const rect = wrapper.getBoundingClientRect();
      const vh = window.innerHeight;
      const show = rect.top < vh && rect.bottom > vh && contentW > wrapper.clientWidth;

      mirror.style.display = show ? 'block' : 'none';
      mirror.style.left = rect.left + 'px';
      mirror.style.width = rect.width + 'px';
      if (show) mirror.scrollLeft = wrapper.scrollLeft;
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
    scrollParent.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    wrapper.addEventListener('scroll', onWrapper, { passive: true });
    mirror.addEventListener('scroll', onMirror, { passive: true });
    update();

    return () => {
      alive = false;
      ro.disconnect();
      scrollParent.removeEventListener('scroll', update);
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
