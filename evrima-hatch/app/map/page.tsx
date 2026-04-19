'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';
import { leaveMap } from '../../server/actions';

export default function MapPage() {
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [selectedDino, setSelectedDino] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [isLive, setIsLive] = useState(false);

  const router = useRouter();

  const round = (val: any) => Math.round(Number(val) || 0);

  useEffect(() => {
    checkMapPermission();
  }, []);

  const checkMapPermission = async () => {
    console.log('🔍 [MAP] Starting checkMapPermission...');
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('🚫 [MAP] No session → redirecting to /hub');
        return router.push('/hub');
      }

      const userId = session.user.id;
      setCurrentUserId(userId);
      console.log(`🔑 [MAP] Authenticated user: ${userId.slice(0, 8)}...`);

      // 1. Check player state
      const { data: state, error: stateError } = await supabase
        .from('evrima_player_state')
        .select('current_map_key, selected_dino_id')
        .eq('user_id', userId)
        .single();

      if (stateError) throw new Error(`State query failed: ${stateError.message}`);
      if (!state?.current_map_key || state.current_map_key !== 'forest') {
        console.log('🚫 [MAP] Not in forest map → redirecting');
        return router.push('/hub');
      }

      // 2. Load selected dino
      if (state.selected_dino_id) {
        const { data: dino } = await supabase
          .from('evrima_player_dinos')
          .select('*')
          .eq('id', state.selected_dino_id)
          .single();
        if (dino) setSelectedDino(dino);
      }

      // 3. Load current instance + players
      await loadCurrentInstance(userId);

      console.log('✅ [MAP] Permission check completed successfully');
    } catch (err: any) {
      console.error('❌ [MAP] checkMapPermission failed:', err);
      setError(err.message || 'Unknown error while loading map');
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
      console.log(`📍 [MAP] Found instance: ${presence.instance_id}`);
      setInstanceId(presence.instance_id);
      await loadPlayersInInstance(presence.instance_id, userId);
      setupRealtimeSubscription(presence.instance_id, userId);
    } else {
      console.warn('⚠️ [MAP] No active instance found for user');
    }
  };

  const loadPlayersInInstance = async (instId: string, userId: string) => {
    const { data: presenceRows, error } = await supabase
      .from('evrima_player_presence')
      .select('user_id, dino_id')
      .eq('instance_id', instId);

    if (error) {
      console.error('❌ [MAP] Error loading presence:', error);
      return;
    }

    const otherPresences = presenceRows?.filter(p => p.user_id !== userId) || [];
    if (otherPresences.length === 0) {
      setPlayers([]);
      return;
    }

    const otherDinoIds = otherPresences.map(p => p.dino_id).filter(Boolean);

    const { data: otherDinos } = await supabase
      .from('evrima_player_dinos')
      .select('id, dino_name, stage, growth, species_key')
      .in('id', otherDinoIds);

    const combined = otherPresences.map(p => ({
      user_id: p.user_id,
      evrima_player_dinos: otherDinos?.find(d => d.id === p.dino_id) || null
    }));

    setPlayers(combined);
  };

  const setupRealtimeSubscription = (instId: string, userId: string) => {
    const channel = supabase
      .channel(`map-presence:${instId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'evrima_player_presence',
        filter: `instance_id=eq.${instId}`,
      }, () => {
        console.log('🔴 [MAP REALTIME] Change detected – refreshing');
        loadPlayersInInstance(instId, userId);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setIsLive(true);
      });

    return () => supabase.removeChannel(channel);
  };

  const handleRevealNearby = () => {
    console.log('🔍 REVEAL NEARBY DINOSAUR clicked');
    setRevealed(true);
  };

  const handleReturnToHub = async () => {
    try {
      await leaveMap();
    } catch (err) {
      console.error('⚠️ Leave map failed:', err);
    }
    router.push('/hub');
  };

  if (loading) {
    return (
      <div className="loading">
        CHECKING MAP ACCESS...
        <div style={{ marginTop: '20px', fontSize: '0.9rem', opacity: 0.6 }}>
          (This should only take a second)
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="loading" style={{ color: '#f44' }}>
        ERROR<br />
        <span style={{ fontSize: '0.9rem' }}>{error}</span>
        <button 
          onClick={() => window.location.reload()}
          style={{ marginTop: '30px', padding: '12px 24px' }}
        >
          RELOAD PAGE
        </button>
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        html, body { height: 100%; overflow: auto; background: #0a1f0a; color: #0f0; font-family: 'Press Start 2P', system-ui; }
        * { box-sizing: border-box; }
        .root { min-height: 100vh; display: grid; grid-template-rows: 80px 1fr 80px; position: relative; }
        .main { display: grid; grid-template-columns: 340px 1fr 340px; gap: 24px; padding: 24px 40px; min-height: 0; background: #050f05; }
        .panel { border: 4px solid #0f0; box-shadow: 0 0 12px #0f0; background: #112211; display: flex; flex-direction: column; min-height: 0; text-transform: uppercase; letter-spacing: 2px; overflow: hidden; }
        .scroll { overflow-y: auto; flex: 1; min-height: 0; padding: 12px; }
        .map-area { background: #0a1f0a; border: 4px solid #0f0; position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 1.4rem; color: #0f0; text-shadow: 0 0 12px #0f0; overflow: hidden; gap: 20px; }
        .header-text { text-shadow: 0 0 8px #0f0; letter-spacing: 3px; }
        .loading { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 1.4rem; text-shadow: 0 0 12px #0f0; }
        .footer { position: relative; z-index: 10000; display: flex; justify-content: center; align-items: center; padding: 12px; border-top: 4px solid #0f0; font-size: 0.9rem; gap: 12px; }
        .player-item { padding: 10px 14px; border-bottom: 1px dotted #0f0; font-size: 0.82rem; color: #0ff; }
        .reveal-btn, .force-btn { border: 3px solid #ff0; background: #112211; color: #ff0; padding: 14px 24px; font-family: 'Press Start 2P', system-ui; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 2px; cursor: pointer; transition: all 0.2s; }
        .reveal-btn:hover, .force-btn:hover { background: #ff0; color: #111133; }
        @media (max-width: 900px) {
          .root { grid-template-rows: 70px 1fr 80px; }
          .main { grid-template-columns: 1fr; gap: 16px; padding: 16px 12px; }
          .map-area { min-height: 340px; font-size: 1.1rem; }
        }
      `}</style>

      <div className="root">
        <header className="panel" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', borderBottom: '4px solid #0f0' }}>
          <div className="header-text">🌲 FOREST MAP <span style={{ color: isLive ? '#0f0' : '#f44', marginLeft: '8px' }}>● LIVE</span></div>
          <div className="header-text" style={{ fontSize: '1.05rem', color: '#0ff' }}>
            INSTANCE: {instanceId ? instanceId.slice(0, 8) : 'LOADING...'}
          </div>
        </header>

        <div className="main">
          {/* LEFT - SELECTED DINO */}
          <div className="panel">
            <div style={{ padding: '14px 18px', background: '#0a1f0a', borderBottom: '3px solid #0f0', fontSize: '0.95rem', textShadow: '0 0 8px #0f0' }}>
              SELECTED DINO
            </div>
            <div className="scroll" style={{ padding: '20px' }}>
              {selectedDino ? (
                <>
                  <div style={{ fontSize: '2.2rem', textAlign: 'center', marginBottom: '12px' }}>
                    {selectedDino.stage === 'egg' ? '🪺' : '🦕'}
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '1.3rem', marginBottom: '8px' }}>
                    {selectedDino.dino_name}
                  </div>
                  <div style={{ textAlign: 'center', color: '#0ff', fontSize: '0.95rem' }}>
                    {selectedDino.stage} • {round(selectedDino.growth)}%
                  </div>
                </>
              ) : (
                <p style={{ textAlign: 'center', opacity: 0.5 }}>NO DINO SELECTED</p>
              )}
            </div>
          </div>

          {/* CENTER - MAP AREA */}
          <div className="panel map-area">
            <div style={{ textAlign: 'center', zIndex: 2 }}>
              🌲 <strong>FOREST</strong> 🌲<br />
              <span style={{ fontSize: '0.9rem', opacity: 0.6 }}>LIVE SIMULATION AREA</span>
              <div style={{ marginTop: '30px', fontSize: '1rem', opacity: 0.4 }}>
                [ FUTURE MAP CANVAS / LEAFLET / SPRITES GO HERE ]<br />
                <strong>{players.length + 1}</strong> DINOS IN THIS INSTANCE
              </div>
            </div>

            <button className="reveal-btn" onClick={handleRevealNearby} style={{ zIndex: 3 }}>
              REVEAL NEARBY DINOSAUR
            </button>
          </div>

          {/* RIGHT - MAP INFO */}
          <div className="panel">
            <div style={{ padding: '14px 18px', background: '#0a1f0a', borderBottom: '3px solid #0f0', fontSize: '0.95rem', textShadow: '0 0 8px #0f0' }}>
              MAP INFO
            </div>
            <div className="scroll" style={{ padding: '14px 18px' }}>
              <div style={{ border: '3px solid #0ff', height: '160px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: '#0ff', background: 'rgba(15,240,0,0.05)' }}>
                MINI-MAP<br />(placeholder)
              </div>

              <div style={{ fontSize: '0.85rem', marginBottom: '12px', color: '#ff0' }}>
                OTHER DINOS IN AREA ({players.length})
              </div>
              
              {players.length > 0 ? (
                players.map((p: any, i: number) => {
                  const dino = p.evrima_player_dinos;
                  const displayName = revealed && dino?.dino_name ? dino.dino_name : 'Unknown';
                  const displayStage = revealed && dino?.stage ? dino.stage : '???';
                  const displayGrowth = revealed && dino?.growth ? round(dino.growth) : 0;

                  return (
                    <div key={i} className="player-item">
                      {displayName} 
                      <span style={{ float: 'right', opacity: 0.7, fontSize: '0.75rem' }}>
                        {displayStage} • {displayGrowth}%
                      </span>
                    </div>
                  );
                })
              ) : (
                <div style={{ opacity: 0.4, fontSize: '0.8rem', textAlign: 'center', padding: '20px 0' }}>
                  NO OTHER PLAYERS YET
                </div>
              )}

              <div style={{ marginTop: '40px' }}>
                <button 
                  style={{ width: '100%', padding: '14px', background: '#112211', border: '3px solid #0ff', color: '#0ff', cursor: 'pointer', fontFamily: 'Press Start 2P, system-ui', fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '2px' }}
                  onClick={handleReturnToHub}
                >
                  ← RETURN TO HUB
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="panel footer">
          <span>🌲 FOREST • {players.length + 1} DINOS ACTIVE</span>
        </div>
      </div>
    </>
  );
}