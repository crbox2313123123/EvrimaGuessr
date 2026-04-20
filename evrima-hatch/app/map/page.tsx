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
  const viewportRef = useRef<PIXI.Container | null>(null);
  const spritesRef = useRef<Map<string, PIXI.Sprite>>(new Map());
  const channelRef = useRef<any>(null);

  const round = (val: any) => Math.round(Number(val) || 0);

  // ─────────────────────────────────────────────────────────────
  // INITIAL AUTH + DATA LOAD
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    init();
    return cleanup;
  }, []);

  const init = async () => {
    try {
      setError(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/hub');
        return;
      }

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

      setInstanceId(state.current_map_key); // for display

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

      // Load own position from entity table
      const { data: entity } = await supabase
        .from('evrima_instance_entities')
        .select('position_x, position_y')
        .eq('dino_id', state.selected_dino_id)
        .single();

      if (entity) {
        setOwnPosition({ x: entity.position_x, y: entity.position_y });
      }

      await loadPlayers();
      setLoading(false);
      initPixi();
      setupRealtime();
    } catch (err: any) {
      console.error('❌ MAP INIT ERROR', err);
      setError(err.message);
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // LOAD NEARBY DINOS + OWN POSITION
  // ─────────────────────────────────────────────────────────────
  const loadPlayers = async () => {
    if (!instanceId || !currentUserId || !currentDinoId) return;

    console.log('🔍 loadPlayers called with:', { instanceId, currentUserId, currentDinoId });

    const { data, error } = await supabase.rpc('get_nearby_dinos', {
      p_instance_id: instanceId,
      p_observer_user_id: currentUserId,
      p_observer_dino_id: currentDinoId,
      p_reveal_radius: 200,
    });

    if (error) {
      console.error('❌ RPC error:', error);
      return;
    }

    console.log('✅ RPC result:', data);
    setPlayers(data || []);
    updateDinoSprites(data || []);
  };

  // ─────────────────────────────────────────────────────────────
  // PIXI INITIALIZATION (camera + background last)
  // ─────────────────────────────────────────────────────────────
  const initPixi = () => {
    if (!pixiContainerRef.current || appRef.current) return;

    const app = new PIXI.Application({
      backgroundColor: 0x112211,
      resizeTo: pixiContainerRef.current,
      antialias: true,
    });

    appRef.current = app;
    pixiContainerRef.current.appendChild(app.view as HTMLCanvasElement);

    const viewport = new PIXI.Container();
    viewportRef.current = viewport;
    app.stage.addChild(viewport);

    // Background added LAST so sprites are always on top
    const bgTexture = PIXI.Texture.from('/islemap.png');
    const background = new PIXI.Sprite(bgTexture);
    background.anchor.set(0.5);
    background.position.set(1250, 1000);
    viewport.addChild(background);

    // Camera controls
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    const canvas = app.view as HTMLCanvasElement;
    canvas.style.pointerEvents = 'auto';

    canvas.addEventListener('pointerdown', (e) => {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!isDragging || !viewportRef.current) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      viewportRef.current.x += dx;
      viewportRef.current.y += dy;
      lastX = e.clientX;
      lastY = e.clientY;
    });

    canvas.addEventListener('pointerup', () => { isDragging = false; });
    canvas.addEventListener('pointerleave', () => { isDragging = false; });

    // Wheel zoom
    canvas.addEventListener('wheel', (e) => {
      if (!viewportRef.current) return;
      const scaleFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const mouseX = e.offsetX;
      const mouseY = e.offsetY;

      const worldPosX = (mouseX - viewportRef.current.x) / viewportRef.current.scale.x;
      const worldPosY = (mouseY - viewportRef.current.y) / viewportRef.current.scale.y;

      viewportRef.current.scale.x *= scaleFactor;
      viewportRef.current.scale.y *= scaleFactor;

      viewportRef.current.x = mouseX - worldPosX * viewportRef.current.scale.x;
      viewportRef.current.y = mouseY - worldPosY * viewportRef.current.scale.y;
    });

    console.log('✅ PIXI + MAP LOADED');
  };

  // ─────────────────────────────────────────────────────────────
  // UPDATE SPRITES (unconditional own dino spawn)
  // ─────────────────────────────────────────────────────────────
  const updateDinoSprites = (nearbyData: any[]) => {
    if (!viewportRef.current) return;

    // OWN DINO - unconditional
    if (selectedDino && currentDinoId && ownPosition) {
      let sprite = spritesRef.current.get(currentDinoId);
      if (!sprite) {
        const stage = selectedDino.stage?.toLowerCase() || 'baby';
        const species = selectedDino.species_key?.toLowerCase() || 'raptor';
        const path = `/sprites/templates/${species}_${stage}_sprite.png`;

        sprite = PIXI.Sprite.from(path);
        sprite.anchor.set(0.5);
        sprite.scale.set(2.5);
        viewportRef.current.addChild(sprite); // before background
        spritesRef.current.set(currentDinoId, sprite);
        console.log(`🦕 Own dino sprite created: ${path}`);
      }
      sprite.x = ownPosition.x;
      sprite.y = ownPosition.y;
    }

    // Nearby dinos
    nearbyData.forEach((p) => {
      const dinoId = p.dino_id;
      if (!dinoId || dinoId === currentDinoId) return;

      let sprite = spritesRef.current.get(dinoId);
      if (!sprite) {
        const stage = p.stage?.toLowerCase() || 'baby';
        const species = p.species_key?.toLowerCase() || 'raptor';
        const path = `/sprites/templates/${species}_${stage}_sprite.png`;

        sprite = PIXI.Sprite.from(path);
        sprite.anchor.set(0.5);
        sprite.scale.set(2);
        viewportRef.current!.addChild(sprite);
        spritesRef.current.set(dinoId, sprite);
      }
      sprite.x = p.position_x;
      sprite.y = p.position_y;
    });
  };

  // ─────────────────────────────────────────────────────────────
  // REALTIME SUBSCRIPTION
  // ─────────────────────────────────────────────────────────────
  const setupRealtime = () => {
    if (channelRef.current) return;

    const channel = supabase.channel(`map-presence:${instanceId}`);
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'evrima_player_presence' }, () => {
        loadPlayers();
      })
      .subscribe();

    channelRef.current = channel;
  };

  const cleanup = () => {
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }
    if (appRef.current) {
      appRef.current.destroy(true);
      appRef.current = null;
    }
  };

  // ─────────────────────────────────────────────────────────────
  // RETURN TO HUB
  // ─────────────────────────────────────────────────────────────
  const handleReturnToHub = async () => {
    await leaveMap();
    router.push('/hub');
  };

  if (loading) {
    return (
      <div className="loading" style={{ background: '#001100', color: '#0ff', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Press Start 2P' }}>
        LOADING FOREST MAP...
      </div>
    );
  }

  if (error) {
    return <div style={{ color: '#f44', padding: 40 }}>ERROR: {error}</div>;
  }

  return (
    <>
      <style jsx global>{`
        .panel { border: 4px solid #0f0; background: #001100; color: #0ff; font-family: 'Press Start 2P', system-ui; }
        .pixi-container { width: 100%; height: 100%; position: relative; }
      `}</style>

      <div className="map-page" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#001100' }}>
        {/* HEADER */}
        <div className="panel" style={{ padding: 12, textAlign: 'center' }}>
          🌲 FOREST MAP • INSTANCE {instanceId?.slice(0, 8)}...
        </div>

        <div style={{ display: 'flex', flex: 1, gap: 12, padding: 12, overflow: 'hidden' }}>
          {/* LEFT - SELECTED DINO */}
          <div className="panel" style={{ width: 280, padding: 16 }}>
            <div style={{ borderBottom: '2px solid #0f0', paddingBottom: 8, marginBottom: 16, textAlign: 'center' }}>
              SELECTED DINO
            </div>
            {selectedDino && (
              <>
                <div style={{ fontSize: '2.2rem', textAlign: 'center', marginBottom: 8 }}>🦕</div>
                <div style={{ fontSize: '1.4rem', textAlign: 'center' }}>{selectedDino.dino_name}</div>
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                  {selectedDino.stage} • {round(selectedDino.growth)}%
                </div>
              </>
            )}
          </div>

          {/* CENTER - MAP */}
          <div className="panel map-container" style={{ flex: 1, position: 'relative', minHeight: 500 }}>
            <div ref={pixiContainerRef} className="pixi-container" />
            <div style={{ position: 'absolute', top: 12, left: 12, color: '#0ff', fontSize: '0.9rem', zIndex: 10 }}>
              {players.length + 1} DINOS ACTIVE
            </div>
          </div>

          {/* RIGHT - OTHER DINOS */}
          <div className="panel" style={{ width: 280, padding: 16, overflowY: 'auto' }}>
            <div style={{ borderBottom: '2px solid #0f0', paddingBottom: 8, marginBottom: 16 }}>
              OTHER DINOS ({players.length})
            </div>
            {players.length ? (
              players.map((p, i) => {
                const d = p.evrima_player_dinos || p;
                return (
                  <div key={i} style={{ padding: '10px 0', borderBottom: '1px dotted #0f0', fontSize: '0.85rem' }}>
                    {d ? `${d.dino_name} • ${d.stage} • ${round(d.growth)}%` : 'Unknown'}
                  </div>
                );
              })
            ) : (
              <div style={{ opacity: 0.5, textAlign: 'center', padding: 40 }}>NO OTHER PLAYERS YET</div>
            )}
          </div>
        </div>

        {/* FOOTER */}
        <div className="panel" style={{ padding: 16, textAlign: 'center' }}>
          <button
            onClick={handleReturnToHub}
            style={{ padding: '14px 40px', background: '#112211', border: '3px solid #0ff', color: '#0ff', fontFamily: 'Press Start 2P', cursor: 'pointer' }}
          >
            ← RETURN TO HUB
          </button>
        </div>
      </div>
    </>
  );
}