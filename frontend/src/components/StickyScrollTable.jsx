import { useEffect, useRef, useState } from 'react';

export default function StickyScrollTable({ children, deps = [] }) {
  const outerRef = useRef(null);
  const mirrorRef = useRef(null);
  const ghostRef = useRef(null);
  const [show, setShow] = useState(false);
  const [left, setLeft] = useState(0);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    function update() {
      const el = outerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const visible = rect.top < vh && rect.bottom > 0;
      const belowFold = rect.bottom > vh;
      setShow(visible && belowFold);
      setLeft(rect.left);
      setWidth(rect.width);
      if (ghostRef.current) {
        const table = el.querySelector('table');
        if (table) ghostRef.current.style.width = table.offsetWidth + 'px';
      }
    }
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, deps);

  function onOuterScroll(e) {
    if (mirrorRef.current) mirrorRef.current.scrollLeft = e.target.scrollLeft;
  }
  function onMirrorScroll(e) {
    if (outerRef.current) outerRef.current.scrollLeft = e.target.scrollLeft;
  }

  return (
    <>
      <div ref={outerRef} style={{ overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }} onScroll={onOuterScroll}>
        <style>{`.sstable-outer::-webkit-scrollbar{display:none}`}</style>
        <div className="sstable-outer" style={{ overflowX: 'auto', scrollbarWidth: 'none' }}>
          {children}
        </div>
      </div>
      {show && (
        <div ref={mirrorRef}
          style={{ position: 'fixed', bottom: 0, left, width, overflowX: 'auto', zIndex: 100, background: '#fff', borderTop: '1px solid #e5e7eb', boxShadow: '0 -2px 8px rgba(0,0,0,0.06)' }}
          onScroll={onMirrorScroll}>
          <div ref={ghostRef} style={{ height: 12 }} />
        </div>
      )}
    </>
  );
}
