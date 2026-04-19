'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';
import { leaveMap } from '../../server/actions';
import * as PIXI from 'pixi.js';

export default function MapPage() {
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [selectedDino, setSelectedDino] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentDinoId, setCurrentDinoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);

  const router = useRouter();
  const channelRef = useRef<any>(null);
  const pixiContainerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const spritesRef = useRef<Map<string, PIXI.Sprite>>(new Map());

  const round = (val: any) => Math.round(Number(val) || 0);

  useEffect(() => {
    checkMapPermission();
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (appRef.current) appRef.current.destroy(true);
    };
  }, []);

  const checkMapPermission = async () => {
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

      await loadCurrentInstance(userId);
    } catch (err: any) {
      setError(err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentInstance = async (userId: string) => {
    const { data: presence } = await supabase
      .from('evrima_player_presence')
      .select('instance_id')
      .eq('user_id', userId)
      .single();

    if (presence?.instance_id) {
      setInstanceId(presence.instance_id);
      await loadNearbyPlayers(presence.instance_id, userId);
      setupRealtimeSubscription(presence.instance_id, userId);
      initPixiJS();
    }
  };

  const loadNearbyPlayers = async (instId: string, userId: string) => {
    if (!currentDinoId) return;

    const { data } = await supabase.rpc('get_nearby_dinos', {
      p_instance_id: instId,
      p_observer_user_id: userId,
      p_observer_dino_id: currentDinoId,
      p_reveal_radius: 200
    });

    setPlayers(data || []);
  };

  const setupRealtimeSubscription = (instId: string, userId: string) => {
    if (channelRef.current) return;

    const channel = supabase
      .channel(`map-presence:${instId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'evrima_player_presence',
        filter: `instance_id=eq.${instId}`
      }, () => loadNearbyPlayers(instId, userId))
      .subscribe();

    channelRef.current = channel;
  };

  const initPixiJS = () => {
    if (!pixiContainerRef.current || appRef.current) return;

    const app = new PIXI.Application({
      width: 1200,
      height: 800,
      backgroundColor: 0x0a1f0a,
      antialias: true,
    });

    pixiContainerRef.current.appendChild(app.view as HTMLCanvasElement);
    appRef.current = app;

    // Background map (replace with your actual image path)
    const bg = PIXI.Sprite.from('/public/islemap.png'); // ← change this path to your image
    bg.width = 2500;
    bg.height = 2000;
    app.stage.addChild(bg);

    // Camera / zoom setup will come next
  };

  const handleReturnToHub = async () => {
    await leaveMap();
    router.push('/hub');
  };

  if (loading) return <div className="loading">LOADING FOREST MAP...</div>;
  if (error) return <div className="loading" style={{ color: '#f44' }}>ERROR: {error}</div>;

  return (
    <>
      <style jsx global>{`
        .root { min-height: 100vh; display: grid; grid-template-rows: 80px 1fr 80px; background: #0a1f0a; color: #0f0; font-family: 'Press Start 2P', system-ui; }
        .main { display: grid; grid-template-columns: 340px 1fr 340px; gap: 24px; padding: 24px; }
        .panel { border: 4px solid #0f0; background: #112211; box-shadow: 0 0 12px #0f0; }
        .map-container { position: relative; overflow: hidden; border: 4px solid #0f0; background: #0a1f0a; }
        .pixi-container { width: 100%; height: 100%; }
        @media (max-width: 900px) {
          .main { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="root">
        <header className="panel" style={{ padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>🌲 FOREST MAP <span style={{ color: isLive ? '#0f0' : '#f44' }}>● LIVE</span></div>
          <div>INSTANCE: {instanceId?.slice(0,8)}</div>
        </header>

        <div className="main">
          {/* Left - Selected Dino */}
          <div className="panel">
            <div style={{ padding: '14px', background: '#0a1f0a', borderBottom: '3px solid #0f0' }}>SELECTED DINO</div>
            <div style={{ padding: '20px', textAlign: 'center' }}>
              {selectedDino && (
                <>
                  <div style={{ fontSize: '2.5rem' }}>🦕</div>
                  <div style={{ fontSize: '1.4rem', margin: '10px 0' }}>{selectedDino.dino_name}</div>
                  <div>{selectedDino.stage} • {round(selectedDino.growth)}%</div>
                </>
              )}
            </div>
          </div>

          {/* Center - PixiJS Map */}
          <div className="panel map-container" style={{ minHeight: '600px' }}>
            <div ref={pixiContainerRef} className="pixi-container" />
            <div style={{ position: 'absolute', top: '20px', left: '20px', color: '#0ff', fontSize: '0.9rem' }}>
              {players.length + 1} DINOS ACTIVE
            </div>
          </div>

          {/* Right - Other Dinos List */}
          <div className="panel">
            <div style={{ padding: '14px', background: '#0a1f0a', borderBottom: '3px solid #0f0' }}>
              OTHER DINOS IN AREA ({players.length})
            </div>
            <div style={{ padding: '14px', maxHeight: '600px', overflowY: 'auto' }}>
              {players.length > 0 ? (
                players.map((p, i) => {
                  const dino = p.evrima_player_dinos;
                  return (
                    <div key={i} style={{ padding: '10px', borderBottom: '1px dotted #0f0', fontSize: '0.85rem' }}>
                      {dino ? `${dino.dino_name} • ${dino.stage} • ${round(dino.growth)}%` : 'Unknown'}
                    </div>
                  );
                })
              ) : (
                <div style={{ padding: '30px', textAlign: 'center', opacity: 0.5 }}>NO OTHER PLAYERS NEARBY YET</div>
              )}
            </div>
          </div>
        </div>

        <div className="panel" style={{ padding: '12px', textAlign: 'center' }}>
          <button onClick={handleReturnToHub} style={{ padding: '14px 32px', background: '#112211', border: '3px solid #0ff', color: '#0ff' }}>
            ← RETURN TO HUB
          </button>
        </div>
      </div>
    </>
  );
}