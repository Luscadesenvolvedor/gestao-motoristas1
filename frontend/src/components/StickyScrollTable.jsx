import { useEffect, useRef, useState } from 'react';

let idCounter = 0;

export default function StickyScrollTable({ children, deps = [] }) {
  const id = useRef('sst-' + (++idCounter)).current;
  const tableRef = useRef(null);
  const mirrorRef = useRef(null);
  const ghostRef = useRef(null);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ left: 0, width: 0 });
  const syncing = useRef(false);

  useEffect(() => {
    // hide native scrollbar via injected style
    const style = document.createElement('style');
    style.textContent = `#${id}::-webkit-scrollbar{display:none}`;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  useEffect(() => {
    function update() {
      const el = tableRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ left: r.left, width: r.width });
      setShow(r.top < window.innerHeight && r.bottom > window.innerHeight);
      const table = el.querySelector('table');
      if (table && ghostRef.current) ghostRef.current.style.width = table.offsetWidth + 'px';
    }
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const obs = new ResizeObserver(update);
    if (tableRef.current) obs.observe(tableRef.current);
    return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update); obs.disconnect(); };
  }, deps);

  function onTableScroll(e) {
    if (syncing.current) return;
    syncing.current = true;
    if (mirrorRef.current) mirrorRef.current.scrollLeft = e.target.scrollLeft;
    syncing.current = false;
  }

  function onMirrorScroll(e) {
    if (syncing.current) return;
    syncing.current = true;
    if (tableRef.current) tableRef.current.scrollLeft = e.target.scrollLeft;
    syncing.current = false;
  }

  return (
    <>
      <div id={id} ref={tableRef}
        style={{ overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        onScroll={onTableScroll}>
        {children}
      </div>
      {show && (
        <div ref={mirrorRef}
          style={{ position: 'fixed', bottom: 0, left: pos.left, width: pos.width, overflowX: 'auto', zIndex: 200, background: '#fff', borderTop: '1px solid #e5e7eb' }}
          onScroll={onMirrorScroll}>
          <div ref={ghostRef} style={{ height: 12 }} />
        </div>
      )}
    </>
  );
}
