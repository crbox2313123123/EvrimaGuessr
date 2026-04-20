'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';
import { leaveMap } from '../../server/actions';
import * as PIXI from 'pixi.js';

// ──────────────────────────────────────────────────────────────
// TYPES (data-driven, matches your DB schema)
// ──────────────────────────────────────────────────────────────
interface DinoEntity {
  dino_id: string;
  position_x: number;
  position_y: number;
  stage: string;
  species_key: string;
  dino_name?: string;
  growth: number;
}

interface PlayerDino {
  id: string;
  dino_name: string;
  stage: string;
  growth: number;
  species_key: string;
  evrima_player_dinos?: PlayerDino; // RPC join
}

// ──────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ──────────────────────────────────────────────────────────────
export default function MapPage() {
  const router = useRouter();

  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentDinoId, setCurrentDinoId] = useState<string | null>(null);
  const [selectedDino, setSelectedDino] = useState<PlayerDino | null>(null);
  const [nearbyDinos, setNearbyDinos] = useState<DinoEntity[]>([]);
  const [ownPosition, setOwnPosition] = useState<{ x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pixiContainerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const worldRef = useRef<PIXI.Container | null>(null);
  const spritesRef = useRef<Map<string, PIXI.Sprite>>(new Map());

  const round = (val: number | null | undefined) => Math.round(Number(val) || 0);

  // ──────────────────────────────────────────────────────────────
  // INITIAL DATA LOAD
  // ──────────────────────────────────────────────────────────────
  const initData = useCallback(async () => {
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

      // Selected dino
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

      // Own position
      const { data: entity } = await supabase
        .from('evrima_instance_entities')
        .select('position_x, position_y')
        .eq('dino_id', state.selected_dino_id)
        .single();

      if (entity) setOwnPosition({ x: entity.position_x, y: entity.position_y });

      await loadNearbyDinos();
      setLoading(false);
    } catch (err: any) {
      console.error('❌ MAP INIT FAILED', err);
      setError(err.message);
      setLoading(false);
    }
  }, [router]);

  // ──────────────────────────────────────────────────────────────
  // LOAD NEARBY DINOS (RPC)
  // ──────────────────────────────────────────────────────────────
  const loadNearbyDinos = useCallback(async () => {
    if (!instanceId || !currentUserId || !currentDinoId) return;

    const { data, error } = await supabase.rpc('get_nearby_dinos', {
      p_instance_id: instanceId,
      p_observer_user_id: currentUserId,
      p_observer_dino_id: currentDinoId,
      p_reveal_radius: 200,
    });

    if (error) {
      console.error('❌ RPC get_nearby_dinos failed', error);
      return;
    }

    setNearbyDinos(data || []);
  }, [instanceId, currentUserId, currentDinoId]);

  // ──────────────────────────────────────────────────────────────
  // REALTIME SUBSCRIPTION (live map for large player base)
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!instanceId) return;

    const channel = supabase
      .channel(`map-${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'evrima_instance_entities',
          filter: `instance_key=eq.${instanceId}`,
        },
        () => {
          loadNearbyDinos(); // refresh on any position change
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [instanceId, loadNearbyDinos]);

  // ──────────────────────────────────────────────────────────────
  // PIXI MAP ENGINE (modular system)
  // ──────────────────────────────────────────────────────────────
  const initPixi = useCallback(async () => {
    if (appRef.current || !pixiContainerRef.current) return;

    const container = pixiContainerRef.current;
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.display = 'block';

    const app = new PIXI.Application();
    await app.init({
      backgroundColor: 0x001100,
      resizeTo: container,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    appRef.current = app;
    container.appendChild(app.canvas);

    // World container (all map layers go here)
    const world = new PIXI.Container();
    worldRef.current = world;
    app.stage.addChild(world);

    // Background
    try {
      const texture = await PIXI.Assets.load('/islemap.png');
      const bg = new PIXI.Sprite(texture);
      bg.anchor.set(0.5);
      bg.position.set(1250, 1000); // map center from your screenshot
      world.addChild(bg);

      // Initial camera fit
      const scaleX = app.screen.width / (bg.width * 1.2);
      const scaleY = app.screen.height / (bg.height * 1.2);
      const initialScale = Math.min(scaleX, scaleY, 1);

      world.scale.set(initialScale);
      world.position.set(
        app.screen.width / 2 - 1250 * initialScale,
        app.screen.height / 2 - 1000 * initialScale
      );
    } catch (err) {
      console.error('❌ Failed to load /islemap.png', err);
    }

    // Simple drag + wheel zoom (production-ready camera)
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    world.eventMode = 'static';
    world.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      isDragging = true;
      lastX = e.global.x;
      lastY = e.global.y;
    });

    app.stage.on('pointermove', (e: PIXI.FederatedPointerEvent) => {
      if (!isDragging || !worldRef.current) return;
      const dx = e.global.x - lastX;
      const dy = e.global.y - lastY;
      worldRef.current.x += dx;
      worldRef.current.y += dy;
      lastX = e.global.x;
      lastY = e.global.y;
    });

    app.stage.on('pointerup', () => { isDragging = false; });
    app.stage.on('pointerupoutside', () => { isDragging = false; });

    // Wheel zoom
    app.canvas.addEventListener('wheel', (e) => {
      if (!worldRef.current || !appRef.current) return;
      e.preventDefault();
      const scaleFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const mouseX = e.offsetX;
      const mouseY = e.offsetY;

      const worldPos = worldRef.current.toLocal(new PIXI.Point(mouseX, mouseY));

      worldRef.current.scale.x *= scaleFactor;
      worldRef.current.scale.y *= scaleFactor;

      worldRef.current.x = mouseX - worldPos.x * worldRef.current.scale.x;
      worldRef.current.y = mouseY - worldPos.y * worldRef.current.scale.y;
    });

    // Render sprites
    updateDinoSprites();
  }, []);

  // ──────────────────────────────────────────────────────────────
  // SPRITE MANAGEMENT (pooled + data-driven)
  // ──────────────────────────────────────────────────────────────
  const updateDinoSprites = useCallback(() => {
    if (!appRef.current || !worldRef.current) return;

    const allDinos = [
      ...(ownPosition && selectedDino && currentDinoId
        ? [{ ...selectedDino, dino_id: currentDinoId, position_x: ownPosition.x, position_y: ownPosition.y }]
        : []),
      ...nearbyDinos,
    ];

    // Remove old sprites
    spritesRef.current.forEach((sprite, id) => {
      if (!allDinos.some((d) => d.dino_id === id)) {
        worldRef.current!.removeChild(sprite);
        sprite.destroy();
        spritesRef.current.delete(id);
      }
    });

    allDinos.forEach((dino) => {
      const id = dino.dino_id;
      let sprite = spritesRef.current.get(id);

      if (!sprite) {
        const stage = (dino.stage || 'baby').toLowerCase();
        const species = (dino.species_key || 'raptor').toLowerCase();
        const path = `/sprites/templates/${species}_${stage}_sprite.png`;

        sprite = PIXI.Sprite.from(path);
        sprite.anchor.set(0.5);
        sprite.scale.set(id === currentDinoId ? 2.8 : 2.2); // own dino slightly larger
        worldRef.current!.addChild(sprite);
        spritesRef.current.set(id, sprite);
      }

      sprite.x = dino.position_x;
      sprite.y = dino.position_y;
    });
  }, [nearbyDinos, ownPosition, selectedDino, currentDinoId]);

  // ──────────────────────────────────────────────────────────────
  // LIFECYCLE
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    initData();
  }, [initData]);

  useEffect(() => {
    if (!loading && pixiContainerRef.current) {
      initPixi();
    }
  }, [loading, initPixi]);

  // Update sprites when data changes
  useEffect(() => {
    updateDinoSprites();
  }, [updateDinoSprites]);

  // Cleanup
  const cleanup = useCallback(() => {
    if (appRef.current) {
      appRef.current.destroy(true, { children: true, texture: true, baseTexture: true });
      appRef.current = null;
    }
    spritesRef.current.clear();
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const handleReturnToHub = async () => {
    await leaveMap();
    router.push('/hub');
  };

  // ──────────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ background: '#001100', color: '#0ff', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Press Start 2P', system-ui" }}>
        LOADING FOREST ECOSYSTEM...
      </div>
    );
  }

  if (error) {
    return <div style={{ color: '#f44', padding: 40, fontFamily: "'Press Start 2P', system-ui" }}>ERROR: {error}</div>;
  }

  return (
    <>
      <style jsx global>{`
        .panel {
          border: 4px solid #0f0;
          background: #001100;
          color: #0ff;
          font-family: 'Press Start 2P', system-ui;
          box-shadow: 0 0 15px #0f0;
        }
        .pixi-container {
          width: 100% !important;
          height: 100% !important;
          position: relative;
          overflow: hidden;
          background: #001100;
        }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#001100' }}>
        {/* HEADER */}
        <div className="panel" style={{ padding: 12, textAlign: 'center', fontSize: '1.1rem' }}>
          🌲 FOREST MAP • INSTANCE {instanceId?.slice(0, 8)}... • LIVE
        </div>

        <div style={{ display: 'flex', flex: 1, gap: 12, padding: 12, overflow: 'hidden' }}>
          {/* LEFT PANEL - SELECTED DINO */}
          <div className="panel" style={{ width: 280, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ borderBottom: '2px solid #0f0', paddingBottom: 8, textAlign: 'center' }}>YOUR DINOSAUR</div>
            {selectedDino && (
              <>
                <div style={{ fontSize: '3rem', textAlign: 'center', lineHeight: 1 }}>🦕</div>
                <div style={{ textAlign: 'center', fontSize: '1.5rem' }}>{selectedDino.dino_name}</div>
                <div style={{ textAlign: 'center' }}>
                  {selectedDino.stage} • {round(selectedDino.growth)}%
                </div>
              </>
            )}
          </div>

          {/* PIXI MAP */}
          <div className="panel" style={{ flex: 1, position: 'relative', minHeight: 500 }}>
            <div ref={pixiContainerRef} className="pixi-container" />
          </div>

          {/* RIGHT PANEL - NEARBY DINOS */}
          <div className="panel" style={{ width: 280, padding: 16, overflowY: 'auto' }}>
            <div style={{ borderBottom: '2px solid #0f0', paddingBottom: 8, marginBottom: 12 }}>
              NEARBY DINOSAURS ({nearbyDinos.length})
            </div>
            {nearbyDinos.length ? (
              nearbyDinos.map((p) => {
                const d = p.evrima_player_dinos || p;
                return (
                  <div key={p.dino_id} style={{ padding: '10px 0', borderBottom: '1px dotted #0f0', fontSize: '0.9rem' }}>
                    {d.dino_name || 'Unknown'} • {d.stage} • {round(d.growth)}%
                  </div>
                );
              })
            ) : (
              <div style={{ opacity: 0.5, textAlign: 'center', padding: 40 }}>NO OTHER DINOSAURS IN RANGE</div>
            )}
          </div>
        </div>

        {/* FOOTER */}
        <div className="panel" style={{ padding: 16, textAlign: 'center' }}>
          <button
            onClick={handleReturnToHub}
            style={{
              padding: '14px 40px',
              background: '#112211',
              border: '3px solid #0ff',
              color: '#0ff',
              fontFamily: "'Press Start 2P', system-ui",
              cursor: 'pointer',
            }}
          >
            ← RETURN TO HUB
          </button>
        </div>
      </div>
    </>
  );
}