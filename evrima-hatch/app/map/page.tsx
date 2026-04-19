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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pixiContainerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const spritesRef = useRef<Map<string, PIXI.Sprite>>(new Map());
  const channelRef = useRef<any>(null);

  const round = (val: any) => Math.round(Number(val) || 0);

  // -------------------------------
  // INITIAL AUTH FLOW
  // -------------------------------
  useEffect(() => {
    init();
    return cleanup;
  }, []);

  const init = async () => {
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

      if (!state || state.current_map_key !== 'forest') {
        return router.push('/hub');
      }

      if (state.selected_dino_id) {
        setCurrentDinoId(state.selected_dino_id);

        const { data: dino } = await supabase
          .from('evrima_player_dinos')
          .select('*')
          .eq('id', state.selected_dino_id)
          .single();

        if (dino) setSelectedDino(dino);
      }

      await loadInstance(userId);

    } catch (err: any) {
      setError(err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const cleanup = () => {
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    if (appRef.current) {
      appRef.current.destroy(true, { children: true });
      appRef.current = null;
    }
  };

  // -------------------------------
  // INSTANCE / PLAYERS
  // -------------------------------
  const loadInstance = async (userId: string) => {
    const { data } = await supabase
      .from('evrima_player_presence')
      .select('instance_id')
      .eq('user_id', userId)
      .single();

    if (!data?.instance_id) return;

    setInstanceId(data.instance_id);
  };

  // 🔥 Proper reactive loading
  useEffect(() => {
    if (!instanceId || !currentUserId || !currentDinoId) return;

    loadPlayers();
    setupRealtime();

  }, [instanceId, currentUserId, currentDinoId]);

  const loadPlayers = async () => {
    const { data } = await supabase.rpc('get_nearby_dinos', {
      p_instance_id: instanceId,
      p_observer_user_id: currentUserId,
      p_observer_dino_id: currentDinoId,
      p_reveal_radius: 200
    });

    setPlayers(data || []);
    updateDinoSprites(data || []);
  };

  const setupRealtime = () => {
    if (channelRef.current) return;

    const channel = supabase
      .channel(`map-${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'evrima_player_presence',
          filter: `instance_id=eq.${instanceId}`
        },
        loadPlayers
      )
      .subscribe();

    channelRef.current = channel;
  };

  // -------------------------------
  // PIXI INIT + CAMERA + SPRITES
  // -------------------------------
  useEffect(() => {
    if (!pixiContainerRef.current) return;
    if (!instanceId || !currentDinoId) return;
    if (appRef.current) return;

    initPixi();

  }, [instanceId, currentDinoId]);

  const initPixi = async () => {
    const container = pixiContainerRef.current!;
    if (!container) return;

    const app = new PIXI.Application();
    await app.init({
      resizeTo: container,
      backgroundColor: 0x0a1f0a,
      antialias: true,
    });

    container.appendChild(app.canvas);
    appRef.current = app;

    // Viewport container for pan/zoom
    const viewport = new PIXI.Container();
    app.stage.addChild(viewport);

    // Load background map
    try {
      const texture = await PIXI.Assets.load('/islemap.png');
      const bg = new PIXI.Sprite(texture);
      bg.anchor.set(0.5);
      bg.x = 1250;
      bg.y = 1000;
      viewport.addChild(bg);
    } catch (err) {
      console.error('❌ MAP FAILED', err);
    }

    console.log('✅ PIXI + MAP LOADED');

    // Camera controls (desktop + mobile)
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    app.canvas.addEventListener('pointerdown', (e) => {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });

    app.canvas.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      viewport.x += dx;
      viewport.y += dy;
      lastX = e.clientX;
      lastY = e.clientY;
    });

    app.canvas.addEventListener('pointerup', () => { isDragging = false; });
    app.canvas.addEventListener('pointerleave', () => { isDragging = false; });

    // Mouse wheel zoom
    app.canvas.addEventListener('wheel', (e) => {
      const scaleFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const mouseX = e.offsetX;
      const mouseY = e.offsetY;

      viewport.scale.x *= scaleFactor;
      viewport.scale.y *= scaleFactor;

      viewport.x = mouseX - (mouseX - viewport.x) * scaleFactor;
      viewport.y = mouseY - (mouseY - viewport.y) * scaleFactor;
    });

    // Mobile pinch zoom support (basic)
    let initialDistance = 0;
    let initialScale = 1;

    app.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        initialDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialScale = viewport.scale.x;
      }
    });

    app.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        const currentDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const scaleFactor = currentDistance / initialDistance;
        viewport.scale.x = initialScale * scaleFactor;
        viewport.scale.y = initialScale * scaleFactor;
      }
    });
  };

  const updateDinoSprites = (nearbyData: any[]) => {
    if (!appRef.current) return;
    const app = appRef.current;

    nearbyData.forEach((item) => {
      const dinoId = item.dino_id.toString();
      let sprite = spritesRef.current.get(dinoId);

      if (!sprite) {
        sprite = PIXI.Sprite.from('/sprites/templates/raptor_baby_sprite.png'); // temporary - will become dynamic
        sprite.anchor.set(0.5);
        sprite.scale.set(0.8);
        app.stage.addChild(sprite);
        spritesRef.current.set(dinoId, sprite);
      }

      sprite.x = item.position_x || 1250;
      sprite.y = item.position_y || 1000;
    });
  };

  // -------------------------------
  // ACTIONS
  // -------------------------------
  const handleReturnToHub = async () => {
    await leaveMap();
    router.push('/hub');
  };

  // -------------------------------
  // UI
  // -------------------------------
  if (loading) return <div className="loading">LOADING FOREST MAP...</div>;
  if (error) return <div className="loading" style={{ color: '#f44' }}>ERROR: {error}</div>;

  return (
    <>
      <style jsx global>{`
        .root {
          min-height: 100vh;
          display: grid;
          grid-template-rows: 80px 1fr 80px;
          background: #0a1f0a;
          color: #0f0;
          font-family: system-ui;
        }

        .main {
          display: grid;
          grid-template-columns: 320px 1fr 320px;
          gap: 16px;
          padding: 16px;
        }

        .panel {
          border: 3px solid #0f0;
          background: #112211;
        }

        .map-container {
          position: relative;
          overflow: hidden;
          min-height: 500px;
        }

        .pixi-container {
          width: 100%;
          height: 100%;
        }

        @media (max-width: 900px) {
          .main {
            grid-template-columns: 1fr;
          }

          .map-container {
            min-height: 60vh;
          }
        }
      `}</style>

      <div className="root">
        {/* HEADER */}
        <header className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px' }}>
          <div>🌲 FOREST MAP</div>
          <div>INSTANCE: {instanceId?.slice(0, 8)}</div>
        </header>

        {/* MAIN */}
        <div className="main">
          {/* LEFT */}
          <div className="panel">
            <div style={{ padding: 12, borderBottom: '2px solid #0f0' }}>SELECTED DINO</div>
            <div style={{ padding: 16, textAlign: 'center' }}>
              {selectedDino && (
                <>
                  <div style={{ fontSize: '2rem' }}>🦕</div>
                  <div>{selectedDino.dino_name}</div>
                  <div>{selectedDino.stage} • {round(selectedDino.growth)}%</div>
                </>
              )}
            </div>
          </div>

          {/* CENTER MAP */}
          <div className="panel map-container">
            <div ref={pixiContainerRef} className="pixi-container" />

            <div style={{
              position: 'absolute',
              top: 10,
              left: 10,
              color: '#0ff',
              fontSize: 12
            }}>
              {players.length + 1} DINOS
            </div>
          </div>

          {/* RIGHT */}
          <div className="panel">
            <div style={{ padding: 12, borderBottom: '2px solid #0f0' }}>
              OTHER DINOS ({players.length})
            </div>

            <div style={{ padding: 12, maxHeight: 500, overflowY: 'auto' }}>
              {players.length ? players.map((p, i) => {
                const d = p.evrima_player_dinos;
                return (
                  <div key={i} style={{ padding: 6 }}>
                    {d ? `${d.dino_name} • ${d.stage} • ${round(d.growth)}%` : 'Unknown'}
                  </div>
                );
              }) : (
                <div style={{ opacity: 0.5 }}>No players nearby</div>
              )}
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="panel" style={{ textAlign: 'center', padding: 10 }}>
          <button onClick={handleReturnToHub}>
            ← RETURN TO HUB
          </button>
        </div>
      </div>
    </>
  );
}