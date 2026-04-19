'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';

export default function MapPage() {
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [selectedDino, setSelectedDino] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkMapPermission();
  }, []);

  const checkMapPermission = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/hub');
      return;
    }

    const userId = session.user.id;

    const { data: state } = await supabase
      .from('evrima_player_state')
      .select('current_map_key, selected_dino_id')
      .eq('user_id', userId)
      .single();

    if (!state?.current_map_key || state.current_map_key !== 'forest') {
      console.log('🚫 No map permission — redirecting to hub');
      router.push('/hub');
      return;
    }

    // Load selected dino for left panel
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
      .select(`
        instance_id,
        evrima_map_instances!inner(id, map_type),
        evrima_player_dinos!inner(dino_name, stage, growth)
      `)
      .eq('user_id', userId)
      .single();

    if (presence) {
      setInstanceId(presence.instance_id);

      // Load all players in this instance
      const { data: allPlayers } = await supabase
        .from('evrima_player_presence')
        .select(`
          user_id,
          evrima_player_dinos!inner(dino_name, stage, growth, species_key)
        `)
        .eq('instance_id', presence.instance_id);

      setPlayers(allPlayers || []);
    }
  };

  const round = (val: any) => Math.round(Number(val) || 0);

  if (loading) return <div className="loading">CHECKING MAP ACCESS...</div>;

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        html, body {
          height: 100%;
          overflow: hidden;
          background: #0a1f0a;
          color: #0f0;
          font-family: 'Press Start 2P', system-ui;
        }
        * { box-sizing: border-box; }
        .root { height: 100vh; display: grid; grid-template-rows: 90px 1fr 90px; }
        .main {
          display: grid;
          grid-template-columns: 340px 1fr 340px;
          gap: 24px;
          padding: 24px 40px;
          min-height: 0;
          background: #050f05;
        }
        .panel {
          border: 4px solid #0f0;
          box-shadow: 0 0 12px #0f0;
          background: #112211;
          display: flex;
          flex-direction: column;
          min-height: 0;
          text-transform: uppercase;
          letter-spacing: 2px;
        }
        .scroll { overflow-y: auto; flex: 1; min-height: 0; padding: 12px; }
        .map-area {
          background: #0a1f0a;
          border: 4px solid #0f0;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.4rem;
          color: #0f0;
          text-shadow: 0 0 12px #0f0;
          overflow: hidden;
        }
        .map-area::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle, rgba(15,240,0,0.1) 0%, transparent 70%);
          pointer-events: none;
        }
        .stat-row {
          display: grid;
          grid-template-columns: 140px 1fr;
          gap: 12px;
          font-size: 0.78rem;
          padding: 8px 0;
          border-bottom: 1px dotted rgba(15,240,0,0.2);
        }
        .header-text {
          text-shadow: 0 0 8px #0f0;
          letter-spacing: 3px;
        }
        .loading {
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.4rem;
          text-shadow: 0 0 12px #0f0;
        }
        @media (max-width: 900px) {
          .main { grid-template-columns: 1fr; gap: 16px; padding: 16px; }
        }
      `}</style>

      <div className="root">
        {/* HEADER */}
        <header className="panel" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', borderBottom: '4px solid #0f0' }}>
          <div className="header-text">🌲 FOREST MAP</div>
          <div className="header-text" style={{ fontSize: '1.05rem', color: '#0ff' }}>
            INSTANCE: {instanceId ? instanceId.slice(0, 8) : 'LOADING...'}
          </div>
        </header>

        <div className="main">
          {/* LEFT PANEL - SELECTED DINO */}
          <div className="panel">
            <div style={{ padding: '14px 18px', background: '#0a1f0a', borderBottom: '3px solid #0f0', fontSize: '0.95rem' }}>
              SELECTED DINO
            </div>
            <div className="scroll" style={{ padding: '20px' }}>
              {selectedDino ? (
                <>
                  <div style={{ fontSize: '2rem', textAlign: 'center', marginBottom: '12px' }}>
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
                <p style={{ textAlign: 'center', opacity: 0.5 }}>No dino selected</p>
              )}
            </div>
          </div>

          {/* CENTER - MAP AREA */}
          <div className="panel map-area">
            <div>
              🌲 <strong>FOREST</strong> 🌲<br />
              <span style={{ fontSize: '0.9rem', opacity: 0.6 }}>Live Simulation Area</span>
              <div style={{ marginTop: '40px', fontSize: '1rem', opacity: 0.4 }}>
                [ Future Map Canvas / Leaflet will go here ]<br />
                Current players in instance: <strong>{players.length}</strong>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL - INFO */}
          <div className="panel">
            <div style={{ padding: '14px 18px', background: '#0a1f0a', borderBottom: '3px solid #0f0', fontSize: '0.95rem' }}>
              MAP INFO
            </div>
            <div className="scroll" style={{ padding: '14px 18px' }}>
              {/* Mini-map placeholder */}
              <div style={{ border: '3px solid #0ff', height: '160px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: '#0ff' }}>
                MINI-MAP<br />(placeholder)
              </div>

              {/* Other players */}
              <div style={{ fontSize: '0.85rem', marginBottom: '12px' }}>OTHER DINOS IN AREA</div>
              {players.length > 0 ? (
                players.map((p: any, i: number) => (
                  <div key={i} style={{ padding: '8px', borderBottom: '1px dotted #0f0', fontSize: '0.78rem' }}>
                    {p.evrima_player_dinos?.dino_name || 'Unknown'} • {p.evrima_player_dinos?.stage}
                  </div>
                ))
              ) : (
                <div style={{ opacity: 0.4, fontSize: '0.8rem' }}>No other players yet</div>
              )}

              <div style={{ marginTop: '30px', fontSize: '0.85rem' }}>
                <button 
                  style={{ width: '100%', padding: '14px', background: '#112211', border: '3px solid #0ff', color: '#0ff', cursor: 'pointer' }}
                  onClick={() => router.push('/hub')}
                >
                  RETURN TO HUB
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="panel" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '20px', borderTop: '4px solid #0f0', fontSize: '0.9rem' }}>
          <span>🌲 FOREST • {players.length} DINOS ACTIVE</span>
        </div>
      </div>
    </>
  );
}