export default function StickyScrollTable({ children }) {
  return (
    <div style={{
      overflowX: 'auto',
      overflowY: 'visible',
      paddingBottom: 2,
    }}>
      {children}
    </div>
  );
}
