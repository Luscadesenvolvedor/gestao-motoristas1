import { useEffect, useRef } from 'react';

export default function StickyScrollTable({ children, deps = [] }) {
  const outerRef = useRef(null);
  const mirrorRef = useRef(null);
  const ghostRef = useRef(null);

  useEffect(() => {
    function sync() {
      const table = outerRef.current?.querySelector('table');
      if (table && ghostRef.current) {
        ghostRef.current.style.width = table.offsetWidth + 'px';
      }
    }
    sync();
    window.addEventListener('resize', sync);
    const obs = new ResizeObserver(sync);
    const table = outerRef.current?.querySelector('table');
    if (table) obs.observe(table);
    return () => { window.removeEventListener('resize', sync); obs.disconnect(); };
  }, deps);

  function onOuterScroll(e) {
    if (mirrorRef.current) mirrorRef.current.scrollLeft = e.target.scrollLeft;
  }
  function onMirrorScroll(e) {
    if (outerRef.current) outerRef.current.scrollLeft = e.target.scrollLeft;
  }

  return (
    <>
      <div ref={outerRef} style={{ overflowX: 'auto' }} onScroll={onOuterScroll}>
        {children}
      </div>
      <div ref={mirrorRef} style={{ overflowX: 'auto', position: 'sticky', bottom: 0, background: '#fff', borderTop: '1px solid #e5e7eb' }} onScroll={onMirrorScroll}>
        <div ref={ghostRef} style={{ height: 1 }} />
      </div>
    </>
  );
}
