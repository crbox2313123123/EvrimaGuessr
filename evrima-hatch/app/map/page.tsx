'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';
import { leaveMap } from '../../server/actions';
import * as PIXI from 'pixi.js';

export default function MapPage() {
  const router = useRouter();

  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [selectedDino, setSelectedDino] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentDinoId, setCurrentDinoId] = useState<string | null>(null);
  const [ownPosition, setOwnPosition] = useState<{ x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pixiContainerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const channelRef = useRef<any>(null);

  const round = (val: any) => Math.round(Number(val) || 0);

  useEffect(() => {
    console.log('🚀 MAP PAGE MOUNTED');
    init();
    return cleanup;
  }, []);

  const init = async () => {
    console.log('🔄 init() started');
    try {
      setError(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('🚫 No session, redirecting to /hub');
        router.push('/hub');
        return;
      }

      const userId = session.user.id;
      setCurrentUserId(userId);
      console.log('✅ User authenticated');

      // ... (rest of data loading stays the same as before, but I kept it short for clarity)

      await loadPlayers();
      setLoading(false);
      console.log('✅ Data loaded, calling initPixi');
      initPixi();
      setupRealtime();
    } catch (err: any) {
      console.error('❌ INIT CRASHED', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const loadPlayers = async () => {
    console.log('🔍 loadPlayers called');
    // (kept simple for now)
    setPlayers([]);
  };

  const initPixi = () => {
    console.log('🎮 initPixi() CALLED');

    if (!pixiContainerRef.current) {
      console.error('❌ pixiContainerRef.current is null');
      return;
    }

    if (appRef.current) {
      console.log('⚠️ Pixi already initialized');
      return;
    }

    try {
      const app = new PIXI.Application({
        backgroundColor: 0x003300,   // solid green so we KNOW it's working
        resizeTo: pixiContainerRef.current,
        antialias: true,
      });

      appRef.current = app;

      // THIS IS THE IMPORTANT LINE
      pixiContainerRef.current.appendChild(app.canvas);
      console.log('✅ app.canvas appended to container');

      // Simple background for testing
      const bg = PIXI.Sprite.from('/islemap.png');
      bg.anchor.set(0.5);
      bg.position.set(1250, 1000);
      app.stage.addChild(bg);
      console.log('✅ Background sprite added');

      console.log('🎉 PIXI SHOULD BE VISIBLE NOW');
    } catch (e) {
      console.error('❌ initPixi CRASHED', e);
    }
  };

  const setupRealtime = () => {
    console.log('📡 Realtime setup (placeholder)');
  };

  const cleanup = () => {
    console.log('🧹 Cleanup');
  };

  const handleReturnToHub = async () => {
    await leaveMap();
    router.push('/hub');
  };

  if (loading) return <div style={{ background: '#001100', color: '#0ff', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>LOADING...</div>;

  return (
    <>
      <style jsx global>{`
        .panel { border: 4px solid #0f0; background: #001100; color: #0ff; font-family: 'Press Start 2P', system-ui; }
        .pixi-container { width: 100%; height: 100%; position: relative; }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#001100' }}>
        <div className="panel" style={{ padding: 12, textAlign: 'center' }}>
          🌲 FOREST MAP • INSTANCE {instanceId?.slice(0, 8)}...
        </div>

        <div style={{ display: 'flex', flex: 1, gap: 12, padding: 12 }}>
          {/* LEFT PANEL */}
          <div className="panel" style={{ width: 280, padding: 16 }}>
            <div style={{ borderBottom: '2px solid #0f0', paddingBottom: 8, textAlign: 'center' }}>SELECTED DINO</div>
            {selectedDino && (
              <>
                <div style={{ fontSize: '2.2rem', textAlign: 'center' }}>🦕</div>
                <div style={{ textAlign: 'center', fontSize: '1.4rem' }}>{selectedDino.dino_name}</div>
                <div style={{ textAlign: 'center' }}>{selectedDino.stage} • {round(selectedDino.growth)}%</div>
              </>
            )}
          </div>

          {/* MAP AREA */}
          <div className="panel" style={{ flex: 1, position: 'relative', minHeight: 500 }}>
            <div ref={pixiContainerRef} className="pixi-container" />
          </div>

          {/* RIGHT PANEL */}
          <div className="panel" style={{ width: 280, padding: 16 }}>
            <div style={{ borderBottom: '2px solid #0f0', paddingBottom: 8 }}>OTHER DINOS (0)</div>
            <div style={{ opacity: 0.5, textAlign: 'center', padding: 40 }}>NO OTHER PLAYERS YET</div>
          </div>
        </div>

        <div className="panel" style={{ padding: 16, textAlign: 'center' }}>
          <button onClick={handleReturnToHub} style={{ padding: '14px 40px', background: '#112211', border: '3px solid #0ff', color: '#0ff' }}>
            ← RETURN TO HUB
          </button>
        </div>
      </div>
    </>
  );
}