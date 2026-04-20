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
    console.log('🚀 MAP COMPONENT MOUNTED');
    initData();
    return cleanup;
  }, []);

  const initData = async () => {
    console.log('🔄 initData started');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.push('/hub');

      const userId = session.user.id;
      setCurrentUserId(userId);

      const { data: state } = await supabase
        .from('evrima_player_state')
        .select('current_map_key, selected_dino_id')
        .eq('user_id', userId)
        .single();

      if (!state?.current_map_key || state.current_map_key !== 'forest') {
        router.push('/hub');
        return;
      }

      setInstanceId(state.current_map_key);

      if (state.selected_dino_id) {
        const { data: dino } = await supabase
          .from('evrima_player_dinos')
          .select('*')
          .eq('id', state.selected_dino_id)
          .single();
        if (dino) {
          setSelectedDino(dino);
          setCurrentDinoId(dino.id);
        }
      }

      const { data: entity } = await supabase
        .from('evrima_instance_entities')
        .select('position_x, position_y')
        .eq('dino_id', state.selected_dino_id)
        .single();

      if (entity) setOwnPosition({ x: entity.position_x, y: entity.position_y });

      await loadPlayers();
      setLoading(false);
      console.log('✅ Data loaded - calling initPixi');
    } catch (err: any) {
      console.error('❌ DATA INIT FAILED', err);
      setError(err.message);
      setLoading(false);
    }
  };

  // Pixi only starts AFTER loading=false AND ref exists
  useEffect(() => {
    if (loading || !pixiContainerRef.current) return;
    initPixi();
  }, [loading]);

  const initPixi = async () => {
    console.log('🎮 initPixi() CALLED - using modern Pixi v8 style');

    if (appRef.current) return;

    try {
      const app = new PIXI.Application();
      await app.init({
        backgroundColor: 0x00ff00,   // BRIGHT GREEN - proof Pixi is alive
        resizeTo: pixiContainerRef.current!,
        antialias: true,
      });

      appRef.current = app;

      pixiContainerRef.current!.appendChild(app.canvas);
      console.log('✅ app.canvas appended successfully');

      // Background
      const bg = PIXI.Sprite.from('/islemap.png');
      bg.anchor.set(0.5);
      bg.position.set(1250, 1000);
      app.stage.addChild(bg);
      console.log('✅ Background image added');

      console.log('🎉 MAP SHOULD BE VISIBLE NOW');
    } catch (e) {
      console.error('❌ initPixi CRASHED', e);
    }
  };

  const loadPlayers = async () => {
    console.log('🔍 loadPlayers called');
    setPlayers([]);
  };

  const cleanup = () => {
    console.log('🧹 Cleanup');
    if (appRef.current) appRef.current.destroy(true);
  };

  const handleReturnToHub = async () => {
    await leaveMap();
    router.push('/hub');
  };

  if (loading) {
    return <div style={{ background: '#001100', color: '#0ff', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>LOADING FOREST MAP...</div>;
  }

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

          <div className="panel" style={{ flex: 1, position: 'relative', minHeight: 500 }}>
            <div ref={pixiContainerRef} className="pixi-container" />
          </div>

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