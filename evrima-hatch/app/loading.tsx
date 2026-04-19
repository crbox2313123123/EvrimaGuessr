'use client';

export default function Loading() {
  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      background: '#0a0a1f',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      color: '#0f0',
      fontFamily: '"Press Start 2P", system-ui',
      fontSize: '1.4rem',
      textShadow: '0 0 12px #0f0',
      gap: '20px',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 99999,
    }}>
      <div style={{
        fontSize: '2.2rem',
        animation: 'pulse 1.5s infinite ease-in-out',
      }}>
        LOADING...
      </div>
      
      <div style={{
        fontSize: '0.85rem',
        opacity: 0.6,
        letterSpacing: '3px',
      }}>
        RETRIEVING DINOSAUR DATA
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}