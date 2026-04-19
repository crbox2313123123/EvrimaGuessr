'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';
import { leaveMap } from '../../server/actions';

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

  const round = (val: any) => Math.round(Number(val) || 0);

  useEffect(() => {
    console.log('🚀 [MAP] Component mounted');
    checkMapPermission();
    return () => {
      console.log('🧹 [MAP] Component unmounting - cleaning up realtime');
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  const checkMapPermission = async () => {
    console.log('🔍 [MAP] === checkMapPermission START ===');
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('🚫 [MAP] No session → redirecting');
        return router.push('/hub');
      }

      const userId = session.user.id;
      setCurrentUserId(userId);
      console.log(`🔑 [MAP] Auth successful - user: ${userId.slice(0, 8)}...`);

      const { data: state } = await supabase
        .from('evrima_player_state')
        .select('current_map_key, selected_dino_id')
        .eq('user_id', userId)
        .single();

      if (!state?.current_map_key || state.current_map_key !== 'forest') {
        console.log('🚫 [MAP] Not in forest map → redirecting');
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
      console.log('✅ [MAP] Permission check completed');
    } catch (err: any) {
      console.error('❌ [MAP] checkMapPermission FAILED:', err);
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
      console.log(`📍 [MAP] Found instance: ${presence.instance_id}`);
      setInstanceId(presence.instance_id);
      await loadNearbyPlayers(presence.instance_id, userId);
      setupRealtimeSubscription(presence.instance_id, userId);
    }
  };

  const loadNearbyPlayers = async (instId: string, userId: string) => {
    console.log(`🔄 [MAP] loadNearbyPlayers for instance ${instId}`);

    if (!currentDinoId) {
      console.warn('⚠️ [MAP] No current dino id yet');
      return;
    }

    const { data, error } = await supabase
      .rpc('get_nearby_dinos', {
        p_instance_id: instId,
        p_observer_user_id: userId,
        p_observer_dino_id: currentDinoId,
        p_reveal_radius: 150   // adjust this value later if needed
      });

    if (error) {
      console.error('❌ [MAP] Error calling get_nearby_dinos:', error);
      return;
    }

    // Transform for UI
    const formatted = data?.map((item: any) => ({
      user_id: item.user_id,
      evrima_player_dinos: item.is_revealed ? {
        dino_name: item.dino_name,
        stage: item.stage,
        growth: item.growth
      } : null
    })) || [];

    setPlayers(formatted);
    console.log(`✅ [MAP] Nearby players loaded: ${formatted.length} (revealed where close)`);
  };

  const setupRealtimeSubscription = (instId: string, userId: string) => {
    if (channelRef.current) return;

    const channel = supabase
      .channel(`map-presence:${instId}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'evrima_player_presence', 
          filter: `instance_id=eq.${instId}` 
        },
        () => {
          console.log('🔴 [MAP REALTIME] Presence changed → refreshing nearby list');
          loadNearbyPlayers(instId, userId);
        }
      )
      .subscribe((status) => {
        console.log(`📡 [MAP REALTIME] Status: ${status}`);
        if (status === 'SUBSCRIBED') setIsLive(true);
      });

    channelRef.current = channel;
  };

  const handleReturnToHub = async () => {
    try {
      await leaveMap();
    } catch (err) {
      console.error('⚠️ leaveMap failed:', err);
    }
    router.push('/hub');
  };

  if (loading) {
    return <div className="loading">CHECKING MAP ACCESS...</div>;
  }

  if (error) {
    return (
      <div className="loading" style={{ color: '#f44' }}>
        ERROR<br />
        <span style={{ fontSize: '0.9rem' }}>{error}</span>
        <button onClick={() => window.location.reload()}>RELOAD PAGE</button>
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        html, body { height: 100%; overflow: auto; background: #0a1f0a; color: #0f0; font-family: 'Press Start 2P', system-ui; }
        .root { min-height: 100vh; display: grid; grid-template-rows: 80px 1fr 80px; }
        .main { display: grid; grid-template-columns: 340px 1fr 340px; gap: 24px; padding: 24px 40px; }
        .panel { border: 4px solid #0f0; box-shadow: 0 0 12px #0f0; background: #112211; display: flex; flex-direction: column; }
        .scroll { overflow-y: auto; flex: 1; padding: 12px; }
        .map-area { background: #0a1f0a; border: 4px solid #0f0; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 1.4rem; color: #0f0; }
        .player-item { padding: 10px 14px; border-bottom: 1px dotted #0f0; font-size: 0.82rem; color: #0ff; }
        @media (max-width: 900px) {
          .main { grid-template-columns: 1fr; gap: 16px; padding: 16px 12px; }
        }
      `}</style>

      <div className="root">
        <header className="panel" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', borderBottom: '4px solid #0f0' }}>
          <div>🌲 FOREST MAP <span style={{ color: isLive ? '#0f0' : '#f44' }}>● LIVE</span></div>
          <div style={{ fontSize: '1.05rem', color: '#0ff' }}>
            INSTANCE: {instanceId ? instanceId.slice(0, 8) : 'LOADING...'}
          </div>
        </header>

        <div className="main">
          {/* LEFT - SELECTED DINO */}
          <div className="panel">
            <div style={{ padding: '14px 18px', background: '#0a1f0a', borderBottom: '3px solid #0f0' }}>SELECTED DINO</div>
            <div className="scroll" style={{ padding: '20px' }}>
              {selectedDino ? (
                <>
                  <div style={{ fontSize: '2.2rem', textAlign: 'center', marginBottom: '12px' }}>🦕</div>
                  <div style={{ textAlign: 'center', fontSize: '1.3rem' }}>{selectedDino.dino_name}</div>
                  <div style={{ textAlign: 'center', color: '#0ff' }}>
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
            <div style={{ textAlign: 'center' }}>
              🌲 <strong>FOREST</strong> 🌲<br />
              <span style={{ fontSize: '0.9rem', opacity: 0.6 }}>LIVE SIMULATION AREA</span>
              <div style={{ marginTop: '40px', fontSize: '1.1rem' }}>
                [ PIXIJS MAP WILL GO HERE ]<br />
                <strong>{players.length + 1}</strong> DINOS IN INSTANCE
              </div>
            </div>
          </div>

          {/* RIGHT - OTHER DINOS */}
          <div className="panel">
            <div style={{ padding: '14px 18px', background: '#0a1f0a', borderBottom: '3px solid #0f0' }}>
              OTHER DINOS IN AREA ({players.length})
            </div>
            <div className="scroll" style={{ padding: '14px 18px' }}>
              {players.length > 0 ? (
                players.map((p: any, i: number) => {
                  const dino = p.evrima_player_dinos;
                  return (
                    <div key={i} className="player-item">
                      {dino ? `${dino.dino_name} • ${dino.stage} • ${round(dino.growth)}%` : 'Unknown'}
                    </div>
                  );
                })
              ) : (
                <div style={{ opacity: 0.4, textAlign: 'center', padding: '30px 0' }}>
                  NO OTHER PLAYERS NEARBY YET
                </div>
              )}

              <div style={{ marginTop: '40px' }}>
                <button 
                  style={{ width: '100%', padding: '14px', background: '#112211', border: '3px solid #0ff', color: '#0ff' }}
                  onClick={handleReturnToHub}
                >
                  ← RETURN TO HUB
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="panel footer" style={{ justifyContent: 'center' }}>
          🌲 FOREST • {players.length + 1} DINOS ACTIVE
        </div>
      </div>
    </>
  );
}