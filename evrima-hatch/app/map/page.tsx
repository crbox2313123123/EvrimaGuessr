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
  const spritesRef = useRef<Map<string, PIXI.Sprite>>(new Map());
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
    } catch (err: any) {
      console.error('❌ DATA INIT FAILED', err);
      setError(err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (loading || !pixiContainerRef.current) return;
    initPixi();
  }, [loading]);

  const initPixi = async () => {
    console.log('🎮 initPixi() CALLED');

    if (appRef.current) return;

    try {
      const app = new PIXI.Application();
      await app.init({
        backgroundColor: 0x001100,
        resizeTo: pixiContainerRef.current!,
        antialias: true,
      });

      appRef.current = app;
      pixiContainerRef.current!.appendChild(app.canvas);
      console.log('✅ app.canvas appended');

      // GPT fix - simple Sprite.from (no Assets.load)
      const bg = PIXI.Sprite.from('/islemap.png');
      bg.anchor.set(0.5);
      bg.position.set(1250, 1000);
      app.stage.addChild(bg);
      console.log('✅ Background added with Sprite.from');

      updateDinoSprites(players);
    } catch (e) {
      console.error('❌ initPixi failed', e);
    }
  };

  const loadPlayers = async () => {
    if (!instanceId || !currentUserId || !currentDinoId) return;
    console.log('🔍 loadPlayers called');

    const { data, error } = await supabase.rpc('get_nearby_dinos', {
      p_instance_id: instanceId,
      p_observer_user_id: currentUserId,
      p_observer_dino_id: currentDinoId,
      p_reveal_radius: 200,
    });

    if (error) {
      console.error('❌ RPC error', error);
      return;
    }

    setPlayers(data || []);
    updateDinoSprites(data || []);
  };

  const updateDinoSprites = (nearbyData: any[]) => {
    if (!appRef.current) return;

    // Own dino
    if (selectedDino && currentDinoId && ownPosition) {
      let sprite = spritesRef.current.get(currentDinoId);
      if (!sprite) {
        const stage = selectedDino.stage?.toLowerCase() || 'baby';
        const species = selectedDino.species_key?.toLowerCase() || 'raptor';
        const path = `/sprites/templates/${species}_${stage}_sprite.png`;

        sprite = PIXI.Sprite.from(path);
        sprite.anchor.set(0.5);
        sprite.scale.set(2.5);
        appRef.current.stage.addChild(sprite);
        spritesRef.current.set(currentDinoId, sprite);
        console.log(`🦕 Own dino sprite created: ${path}`);
      }
      sprite.x = ownPosition.x;
      sprite.y = ownPosition.y;
    }

    // Nearby dinos (future-proof for behavior updates)
    nearbyData.forEach((p) => {
      const id = p.dino_id;
      if (!id || id === currentDinoId) return;
      let sprite = spritesRef.current.get(id);
      if (!sprite) {
        const stage = p.stage?.toLowerCase() || 'baby';
        const species = p.species_key?.toLowerCase() || 'raptor';
        const path = `/sprites/templates/${species}_${stage}_sprite.png`;
        sprite = PIXI.Sprite.from(path);
        sprite.anchor.set(0.5);
        sprite.scale.set(2);
        appRef.current!.stage.addChild(sprite);
        spritesRef.current.set(id, sprite);
      }
      sprite.x = p.position_x;
      sprite.y = p.position_y;
    });
  };

  const cleanup = () => {
    console.log('🧹 Cleanup');
    appRef.current?.destroy(true);
  };

  const handleReturnToHub = async () => {
    await leaveMap();
    router.push('/hub');
  };

  if (loading) return <div style={{ background: '#001100', color: '#0ff', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>LOADING FOREST MAP...</div>;
  if (error) return <div style={{ color: '#f44', padding: 40 }}>ERROR: {error}</div>;

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
            <div style={{ borderBottom: '2px solid #0f0', paddingBottom: 8 }}>OTHER DINOS ({players.length})</div>
            {players.length ? players.map((p, i) => {
              const d = p.evrima_player_dinos || p;
              return <div key={i} style={{ padding: '10px 0', borderBottom: '1px dotted #0f0' }}>{d ? `${d.dino_name} • ${d.stage} • ${round(d.growth)}%` : 'Unknown'}</div>;
            }) : <div style={{ opacity: 0.5, textAlign: 'center', padding: 40 }}>NO OTHER PLAYERS YET</div>}
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