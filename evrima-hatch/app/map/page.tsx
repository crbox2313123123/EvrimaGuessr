'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';

export default function MapPage() {
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [selectedDino, setSelectedDino] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const round = (val: any) => Math.round(Number(val) || 0);

  useEffect(() => {
    checkMapPermission();
  }, []);

  // Auto-refresh every 4 seconds
  useEffect(() => {
    if (!instanceId || !currentUserId) return;
    const interval = setInterval(() => {
      loadPlayersInInstance(instanceId, currentUserId);
    }, 4000);
    return () => clearInterval(interval);
  }, [instanceId, currentUserId]);

  const checkMapPermission = async () => {
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
      const { data: dino } = await supabase
        .from('evrima_player_dinos')
        .select('*')
        .eq('id', state.selected_dino_id)
        .single();
      if (dino) setSelectedDino(dino);
    }

    await loadCurrentInstance(userId);
    setLoading(false);
  };

  const loadCurrentInstance = async (userId: string) => {
    const { data: presence } = await supabase
      .from('evrima_player_presence')
      .select('instance_id')
      .eq('user_id', userId)
      .single();

    if (presence?.instance_id) {
      setInstanceId(presence.instance_id);
      await loadPlayersInInstance(presence.instance_id, userId);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // NEW ROBUST VERSION — no nested join
  // ─────────────────────────────────────────────────────────────
  const loadPlayersInInstance = async (instId: string, userId: string) => {
    // Step 1: Get all presence rows in this instance
    const { data: presenceRows, error } = await supabase
      .from('evrima_player_presence')
      .select('user_id, dino_id')
      .eq('instance_id', instId);

    if (error) {
      console.error('❌ Error loading presence:', error);
      return;
    }

    console.log(`📡 Raw presence rows found: ${presenceRows?.length || 0}`);

    if (!presenceRows || presenceRows.length === 0) return;

    // Step 2: Get only OTHER users
    const otherPresences = presenceRows.filter(p => p.user_id !== userId);
    console.log(`📡 Other players in instance: ${otherPresences.length}`);

    if (otherPresences.length === 0) {
      setPlayers([]);
      return;
    }

    // Step 3: Fetch dino data for the other players
    const otherDinoIds = otherPresences.map(p => p.dino_id).filter(Boolean);

    const { data: otherDinos } = await supabase
      .from('evrima_player_dinos')
      .select('id, dino_name, stage, growth, species_key')
      .in('id', otherDinoIds);

    // Step 4: Combine presence + dino data
    const combined = otherPresences.map(p => {
      const dino = otherDinos?.find(d => d.id === p.dino_id);
      return {
        user_id: p.user_id,
        evrima_player_dinos: dino || null
      };
    });

    setPlayers(combined);
    console.log(`✅ Final other players loaded: ${combined.length}`);
  };

  if (loading) return <div className="loading">CHECKING MAP ACCESS...</div>;

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        html, body {
          height: 100%;
          overflow: auto;
          background: #0a1f0a;
          color: #0f0;
          font-family: 'Press Start 2P', system-ui;
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #0f0; border-radius: 20px; }
        .root { min-height: 100vh; display: grid; grid-template-rows: 80px 1fr 80px; position: relative; }
        .main { display: grid; grid-template-columns: 340px 1fr 340px; gap: 24px; padding: 24px 40px; min-height: 0; background: #050f05; }
        .panel { border: 4px solid #0f0; box-shadow: 0 0 12px #0f0; background: #112211; display: flex; flex-direction: column; min-height: 0; text-transform: uppercase; letter-spacing: 2px; overflow: hidden; }
        .scroll { overflow-y: auto; flex: 1; min-height: 0; padding: 12px; }
        .map-area { background: #0a1f0a; border: 4px solid #0f0; position: relative; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; color: #0f0; text-shadow: 0 0 12px #0f0; overflow: hidden; }
        .map-area::before { content: ''; position: absolute; inset: 0; background: radial-gradient(circle, rgba(15,240,0,0.1) 0%, transparent 70%); pointer-events: none; }
        .header-text { text-shadow: 0 0 8px #0f0; letter-spacing: 3px; }
        .loading { height: 100vh; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; text-shadow: 0 0 12px #0f0; }
        .footer { position: relative; z-index: 10000; display: flex; justify-content: center; align-items: center; padding: 12px; border-top: 4px solid #0f0; font-size: 0.9rem; gap: 12px; }
        .player-item { padding: 10px 14px; border-bottom: 1px dotted #0f0; font-size: 0.82rem; color: #0ff; }
        @media (max-width: 900px) {
          .root { grid-template-rows: 70px 1fr 80px; }
          .main { grid-template-columns: 1fr; gap: 16px; padding: 16px 12px; }
          .map-area { min-height: 320px; font-size: 1.1rem; }
        }
      `}</style>

      <div className="root">
        <header className="panel" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', borderBottom: '4px solid #0f0' }}>
          <div className="header-text">🌲 FOREST MAP</div>
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
              <div style={{ marginTop: '40px', fontSize: '1rem', opacity: 0.4 }}>
                [ FUTURE MAP CANVAS / LEAFLET GOES HERE ]<br />
                <strong>{players.length + 1}</strong> DINOS IN THIS INSTANCE
              </div>
            </div>
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
                players.map((p: any, i: number) => (
                  <div key={i} className="player-item">
                    {p.evrima_player_dinos?.dino_name || 'Unknown'} 
                    <span style={{ float: 'right', opacity: 0.7, fontSize: '0.75rem' }}>
                      {p.evrima_player_dinos?.stage} • {round(p.evrima_player_dinos?.growth)}%
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ opacity: 0.4, fontSize: '0.8rem', textAlign: 'center', padding: '20px 0' }}>
                  NO OTHER PLAYERS YET
                </div>
              )}

              <div style={{ marginTop: '40px' }}>
                <button 
                  style={{ width: '100%', padding: '14px', background: '#112211', border: '3px solid #0ff', color: '#0ff', cursor: 'pointer', fontFamily: 'Press Start 2P, system-ui', fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '2px' }}
                  onClick={() => router.push('/hub')}
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