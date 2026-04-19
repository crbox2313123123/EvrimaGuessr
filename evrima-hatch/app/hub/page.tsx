'use client';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';
import { generateNewEgg, serverTick, recalculateDinoStats, clearAllDinos, enterMap } from '../../server/actions';

interface Dino {
  id: string;
  user_id: string;
  template_id: string;
  species_key: string;
  dino_name: string;
  stage: string;
  growth: number;
  unique_var_speed: number;
  unique_var_combat: number;
  unique_var_health: number;
  hunger: number;
  thirst: number;
  stamina: number;
  fatigue: number;
  bleeding: number;
  broken_limb: boolean;
  broken_ribs: boolean;
  sickness: number;
  infection: number;
  temperature: number;
  limping: number;
  pain: number;
  adrenaline: number;
  exhaustion: number;
  aggression: number;
  frustration: number;
  fear: number;
  confidence: number;
  stress: number;
  comfort: number;
  curiosity: number;
  boredom: number;
  alertness: number;
  territorial_drive: number;
  dominance: number;
  social_need: number;
  threat_level: number;
  perceived_risk: number;
  escape_urge: number;
  ambush_vulnerability: number;
  hunger_urge: number;
  thirst_urge: number;
  rest_urge: number;
  safety_urge: number;
  social_urge: number;
  noise_level: number;
  current_goal: string;
  goal_priority: number;
  decision_cooldown: string;
  commitment: number;
  reactivity: number;
  hesitation: number;
  engaged: boolean;
  target_lock: number;
  damage_recent: number;
  bleed_stack_intensity: number;
  stance: string;
  last_updated: string;
  last_dynamic_update: string;
  current_stats: any;
  created_at: string;
  boldness: number;
  patience: number;
  intelligence: number;
  loyalty: number;
  opportunism: number;
  caution: number;
  metabolism: number;
  immune_strength: number;
  pack_affinity: number;
  submission_tendency: number;
  leadership: number;
  empathy: number;
  tolerance: number;
  ferocity: number;
  defensiveness: number;
  target_focus: number;
  ambush_tendency: number;
  risk_assessment: number;
  vision_range: number;
  night_vision: number;
  smell_sensitivity: number;
  hearing_sensitivity: number;
  location?: string;
}

export default function HubPage() {
  const [dinos, setDinos] = useState<Dino[]>([]);
  const [selected, setSelected] = useState<Dino | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [message, setMessage] = useState<string | null>(null);   // ← NEW

  const router = useRouter();
  const selectedIdRef = useRef<string | null>(null);
  const optionsButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const round = (val: any) => Math.round(Number(val) || 0);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return router.push('/login');
   
    console.log('🔑 DEBUG: Auth successful for user:', session.user.id);
    setCurrentUser(session.user);
    setUserId(session.user.id);
   
    const dinoData = await loadDinos(session.user.id);
    await loadPlayerState(dinoData);
  };

  const loadDinos = async (currentUserId?: string) => {
    const uid = currentUserId || userId;
    if (!uid) return [];
   
    const { data } = await supabase
      .from('evrima_player_dinos')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    const dinoList = data || [];
    setDinos(dinoList);
    console.log('📋 DEBUG: Loaded', dinoList.length, 'dinos in bank for user', uid);
    return dinoList;
  };

  const loadPlayerState = async (freshDinos: Dino[]) => {
    if (!userId) {
      setLoading(false);
      return;
    }
   
    console.log('📡 DEBUG: Loading player state for user:', userId);
   
    const { data: state } = await supabase
      .from('evrima_player_state')
      .select('selected_dino_id')
      .eq('user_id', userId)
      .single();
    if (state?.selected_dino_id) {
      console.log('✅ DEBUG: Found saved selection:', state.selected_dino_id);
     
      const { data: dino } = await supabase
        .from('evrima_player_dinos')
        .select('*')
        .eq('id', state.selected_dino_id)
        .single();
      if (dino) {
        console.log('🎯 DEBUG: Setting selected dino from DB →', dino.dino_name, '(', dino.id, ')');
        setSelected(dino);
        selectedIdRef.current = dino.id;
      }
    } else if (freshDinos.length > 0) {
      const newest = freshDinos[0];
      console.log('🆕 DEBUG: No saved selection → auto-selecting & saving:', newest.dino_name);
      setSelected(newest);
      selectedIdRef.current = newest.id;
      await saveSelectedDino(newest.id);
    }
    setLoading(false);
  };

  const saveSelectedDino = async (dinoId: string) => {
    if (!userId) return;
   
    console.log('💾 DEBUG: Saving selection to evrima_player_state → dinoId:', dinoId);
   
    const { error } = await supabase
      .from('evrima_player_state')
      .upsert({
        user_id: userId,
        selected_dino_id: dinoId,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
    if (error) {
      console.error('❌ Failed to save selection:', error);
    } else {
      console.log('✅ DEBUG: Selection saved successfully');
    }
  };

  const handleSelectDino = async (dino: Dino) => {
    console.log('🖱️ DEBUG: User clicked dino →', dino.dino_name, '(', dino.id, ')');

    // NEW: Dino is not in hub → redirect to map
    if (dino.location !== 'hub') {
      if (dino.location === 'forest') {
        router.push('/map');
      } else {
        setMessage(`This dino is currently in ${dino.location?.toUpperCase() || 'another area'}.`);
      }
      return;
    }

    // NEW: Guard - cannot select new dino if current one is in forest
    if (selected && selected.location !== 'hub') {
      setMessage("Return your current dino from the forest before selecting a new one.");
      return;
    }

    setSelected(dino);
    selectedIdRef.current = dino.id;
    await saveSelectedDino(dino.id);
  };

  useEffect(() => {
    if (!selected?.id) return;
    selectedIdRef.current = selected.id;
    const interval = setInterval(async () => {
      const currentId = selectedIdRef.current;
      if (!currentId) return;
      const { data } = await supabase
        .from('evrima_player_dinos')
        .select('*')
        .eq('id', currentId)
        .single();
      if (data) setSelected(data);
    }, 5000);
    return () => clearInterval(interval);
  }, [selected?.id]);

  useEffect(() => {
    if (!userId) return;
   
    const interval = setInterval(() => {
      loadDinos(userId);
    }, 6000);
    return () => clearInterval(interval);
  }, [userId]);

  // Context menu logic (unchanged)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const isClickOnButton = optionsButtonRef.current?.contains(target) ?? false;
      const isClickOnMenu = menuRef.current?.contains(target) ?? false;
      if (!isClickOnButton && !isClickOnMenu) setShowOptionsMenu(false);
    };

    if (showOptionsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showOptionsMenu]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowOptionsMenu(false);
    };
    if (showOptionsMenu) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [showOptionsMenu]);

  const handleOptionsClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setShowOptionsMenu(prev => !prev);
  };

  const handleGenerateEgg = async () => {
    if (!userId) return;
    setActionLoading(true);
    try {
      await generateNewEgg();
      await loadDinos();
    } catch (err) {
      console.error('Generate egg failed:', err);
    } finally {
      setActionLoading(false);
      setShowOptionsMenu(false);
    }
  };

  const handleServerTick = async () => {
    setActionLoading(true);
    try {
      await serverTick();
      await loadDinos();
    } catch (err) {
      console.error('Server tick failed:', err);
    } finally {
      setActionLoading(false);
      setShowOptionsMenu(false);
    }
  };

  const handleRecalculate = async () => {
    if (!selected || !userId) return;
    setActionLoading(true);
    try {
      await recalculateDinoStats(selected.id);
      await loadDinos();
    } catch (err) {
      console.error('Recalculate failed:', err);
    } finally {
      setActionLoading(false);
      setShowOptionsMenu(false);
    }
  };

  const handleClearAllDinos = async () => {
    if (!userId) return;
    if (!confirm('DELETE ALL DINOS?')) return;
    setActionLoading(true);
    try {
      await clearAllDinos();
      await loadDinos();
      setSelected(null);
      selectedIdRef.current = null;
    } catch (err) {
      console.error('Clear dinos failed:', err);
    } finally {
      setActionLoading(false);
      setShowOptionsMenu(false);
    }
  };

  const handleEnterMap = async () => {
    if (!selected) {
      setMessage('Select a dino first!');
      setShowOptionsMenu(false);
      return;
    }
    if (selected.location !== 'hub') {
      setMessage("This dino is already in the forest.");
      setShowOptionsMenu(false);
      return;
    }
    setActionLoading(true);
    try {
      await enterMap('forest');
      router.push('/map');
    } catch (err: any) {
      console.error('Enter map failed:', err.message);
      setMessage(err.message);
    } finally {
      setActionLoading(false);
      setShowOptionsMenu(false);
    }
  };

  const realMaxHp = selected?.current_stats?.max_health ? round(selected.current_stats.max_health) : 0;
  const realCurrentHp = selected?.current_stats?.current_health ? round(selected.current_stats.current_health) : 0;
  const realWeight = selected?.current_stats?.weight ? round(selected.current_stats.weight) : 0;
  const realCombatPower = selected?.current_stats?.combat_power ? round(selected.current_stats.combat_power) : 0;

  if (loading) return <div className="loading">LOADING...</div>;

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        html, body {
          height: 100%;
          overflow: auto;
          background: #0a0a1f;
          color: #0f0;
          font-family: 'Press Start 2P', system-ui;
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #0f0; border-radius: 20px; }
        .root {
          min-height: 100vh;
          display: grid;
          grid-template-rows: 80px 1fr 80px;
          position: relative;
        }
        .main {
          display: grid;
          grid-template-columns: 340px 0.7fr 420px;
          gap: 24px;
          padding: 24px 40px 24px 110px;
          min-height: 0;
          background: #05050f;
        }
        .panel {
          border: 4px solid #0f0;
          box-shadow: 0 0 12px #0f0;
          background: #111133;
          display: flex;
          flex-direction: column;
          min-height: 0;
          text-transform: uppercase;
          letter-spacing: 2px;
          overflow: hidden;
        }
        .scroll {
          overflow-y: auto;
          flex: 1;
          min-height: 0;
          padding: 12px;
        }
        .dinoItem {
          padding: 14px 18px;
          border-bottom: 2px solid rgba(15,240,0,0.25);
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 0.88rem;
          color: #0f0;
          text-shadow: 0 0 6px #0f0;
          min-height: 78px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .dinoItem.greyed-out {
          opacity: 0.45;
          color: #888;
        }
        .dinoItem:hover:not(.greyed-out) { background: rgba(15,240,0,0.12); transform: translateX(6px); }
        .centerCard {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 20px;
          gap: 12px;
          font-size: 1.1rem;
        }
        .dinoIcon {
          font-size: 82px;
          opacity: 0.35;
          text-shadow: 0 0 12px #0f0;
          animation: float 3s ease-in-out infinite;
        }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        .progress-container {
          height: 14px;
          background: #0a0a1f;
          border: 2px solid #0f0;
          margin-bottom: 10px;
          position: relative;
          overflow: hidden;
        }
        .progress-bar { height: 100%; transition: width 0.4s ease; }
        .stat-label {
          font-size: 0.82rem;
          color: #0ff;
          margin-bottom: 4px;
          display: flex;
          justify-content: space-between;
        }
        .section-header {
          background: #0a0a1f;
          padding: 8px 14px;
          font-size: 0.9rem;
          border-bottom: 3px solid #0f0;
          margin-bottom: 10px;
          text-shadow: 0 0 8px #0f0;
        }
        .see-more {
          cursor: pointer;
          font-size: 0.85rem;
          color: #ff0;
          text-align: center;
          padding: 8px;
          border-top: 2px solid rgba(15,240,0,0.3);
          margin-top: 12px;
          transition: all 0.2s;
        }
        .see-more:hover { color: #0f0; background: rgba(15,240,0,0.1); }
        .stat-row {
          display: grid;
          grid-template-columns: 195px 1fr;
          gap: 18px;
          font-size: 0.78rem;
          align-items: center;
          padding: 10px 0;
          line-height: 1.4;
          border-bottom: 1px dotted rgba(15,240,0,0.15);
        }
        .stat-row span:first-child {
          text-align: right;
          color: #0ff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .stat-row span:last-child {
          color: #ff0;
          text-align: left;
        }
        .header-text {
          text-shadow: 0 0 8px #0f0;
          letter-spacing: 3px;
          font-size: 1.15rem;
        }
        .btn {
          border: 3px solid #0f0;
          padding: 12px 24px;
          background: #111133;
          color: #0f0;
          cursor: pointer;
          font-family: 'Press Start 2P', system-ui;
          font-size: 1.05rem;
          text-transform: uppercase;
          letter-spacing: 2px;
          box-shadow: 0 0 10px #0f0;
          transition: all 0.2s ease;
        }
        .btn:hover:not(:disabled) {
          background: #0f0;
          color: #111133;
          transform: translateY(-2px);
          box-shadow: 0 0 18px #0f0;
        }
        .btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .btn.yellow { color: #ff0; border-color: #ff0; }
        .btn.yellow:hover { background: #ff0; color: #111133; }
        .btn.blue { color: #0ff; border-color: #0ff; }
        .btn.blue:hover { background: #0ff; color: #111133; }
        .btn.red { color: #f44; border-color: #f44; }
        .btn.red:hover { background: #f44; color: #111133; }
        .loading {
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.4rem;
          text-shadow: 0 0 12px #0f0;
        }
        .dino-bank-panel,
        .live-stats-panel {
          max-height: 680px;
          overflow: hidden;
        }
        .advanced-container {
          max-height: 380px;
          overflow-y: auto;
          padding-right: 8px;
        }
        .footer-buttons {
          position: relative;
          z-index: 10000;
          display: flex;
          justify-content: center;
          padding: 12px;
          border-top: 4px solid #0f0;
        }
        .options-menu {
          position: fixed;
          bottom: 90px;
          left: 50%;
          transform: translateX(-50%);
          background: #111133;
          border: 4px solid #0f0;
          box-shadow: 0 0 30px #0f0;
          padding: 12px 0;
          min-width: 320px;
          z-index: 99999;
          display: flex;
          flex-direction: column;
          gap: 4px;
          border-radius: 4px;
        }
        .menu-item {
          padding: 14px 28px;
          font-family: 'Press Start 2P', system-ui;
          font-size: 0.95rem;
          color: #0f0;
          text-transform: uppercase;
          letter-spacing: 2px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .menu-item:hover {
          background: #0f0;
          color: #111133;
        }

        /* MOBILE */
        @media (max-width: 900px) {
          .options-menu {
            bottom: 20px;
            left: 20px;
            right: 20px;
            transform: none;
            min-width: auto;
            max-height: 85vh;
            overflow-y: auto;
            border-radius: 8px;
          }
          .root {
            grid-template-rows: 70px auto 80px;
            min-height: 100vh;
          }
          .main {
            grid-template-columns: 1fr;
            gap: 16px;
            padding: 16px 12px;
          }
          .panel {
            min-height: auto;
            border-width: 3px;
          }
          .dinoItem {
            font-size: 0.82rem;
            padding: 12px 14px;
            min-height: 52px;
          }
          .centerCard {
            padding: 16px;
            font-size: 1rem;
            min-height: 220px;
          }
          .dinoIcon { font-size: 72px; }
          .centerCard > div:nth-child(2) { font-size: 1.15rem !important; }
          .centerCard > div:nth-child(3) { font-size: 0.85rem !important; }
          .stat-row {
            grid-template-columns: 1fr;
            gap: 6px;
            font-size: 0.78rem;
          }
          .dino-bank-panel {
            max-height: 240px;
          }
          .scroll { padding: 10px; }
        }
        @media (max-width: 600px) {
          .main { padding: 12px 8px; }
          .header-text { font-size: 1rem; }
        }
      `}</style>

      <div className="root">
        <header className="panel" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderBottom: '4px solid #0f0' }}>
          <div className="header-text">🦕 EVRIMAHATCH</div>
          <div className="header-text" style={{ fontSize: '1rem', color: '#0ff' }}>
            {currentUser ? (currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'SURVIVOR') : 'SURVIVOR'}
          </div>
        </header>

        <div className="main">
          {/* LEFT - DINO BANK */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0 }}>
            <div className="panel dino-bank-panel">
              <div style={{ padding: '14px 18px', background: '#0a0a1f', borderBottom: '3px solid #0f0', fontSize: '0.95rem', textShadow: '0 0 8px #0f0' }}>DINO BANK</div>
              <div className="scroll">
                {dinos.map(d => {
                  const isInForest = d.location === 'forest';
                  const isSelected = selected?.id === d.id;

                  return (
                    <div
                      key={d.id}
                      className={`dinoItem ${isInForest ? 'greyed-out' : ''}`}
                      onClick={() => handleSelectDino(d)}
                      style={{
                        background: isSelected ? 'rgba(15,240,0,0.25)' : 'transparent',
                        borderLeft: isSelected ? '6px solid #0f0' : 'none'
                      }}
                    >
                      <div style={{ fontSize: '0.95rem', fontWeight: 'bold' }}>{d.dino_name}</div>
                      <div style={{ fontSize: '0.72rem', opacity: 0.75, marginTop: '4px' }}>
                        {(d.location || 'HUB').toUpperCase()} • {d.stage} • {round(d.growth)}%
                      </div>
                      {isInForest && (
                        <div style={{ fontSize: '0.65rem', color: '#ff0', marginTop: '4px' }}>
                          Currently in Forest → Click to go there
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* CENTER - SELECTED DINO */}
          <div className="panel centerCard" style={{ flex: '1 1 auto', minHeight: '260px' }}>
            {selected ? (
              <>
                <div className="dinoIcon">{selected.stage === 'egg' ? '🪺' : '🦕'}</div>
                <div style={{ fontSize: '1.45rem', textShadow: '0 0 12px #0f0', marginTop: '-8px' }}>{selected.dino_name}</div>
                <div style={{ fontSize: '0.92rem', opacity: 0.75, color: '#0ff' }}>
                  {selected.stage} • {round(selected.growth)}% GROWTH
                </div>
                {selected.current_goal && (
                  <div style={{ fontSize: '0.78rem', marginTop: '12px', padding: '4px 12px', background: 'rgba(15,240,0,0.1)', border: '2px solid #0f0', borderRadius: '4px' }}>
                    GOAL: {selected.current_goal.toUpperCase()}
                  </div>
                )}
              </>
            ) : (
              <div style={{ opacity: 0.4, fontSize: '1.1rem' }}>NO DINO SELECTED</div>
            )}
          </div>

          {/* RIGHT - LIVE STATS */}
          <div className="panel live-stats-panel" style={{ flex: '1 1 auto' }}>
            <div style={{ padding: '14px 18px', background: '#0a0a1f', borderBottom: '3px solid #0f0', fontSize: '0.95rem', textShadow: '0 0 8px #0f0' }}>LIVE STATS</div>
            <div className="scroll" style={{ padding: '14px 18px' }}>
              <div className="section-header">SURVIVAL</div>
              <div className="stat-label"><span>HUNGER</span><span style={{ color: '#ff0' }}>{round(selected?.hunger)}</span></div>
              <div className="progress-container"><div className="progress-bar" style={{ width: `${round(selected?.hunger)}%`, background: '#ff0', boxShadow: '0 0 8px #ff0' }} /></div>
              <div className="stat-label"><span>THIRST</span><span style={{ color: '#0ff' }}>{round(selected?.thirst)}</span></div>
              <div className="progress-container"><div className="progress-bar" style={{ width: `${round(selected?.thirst)}%`, background: '#0ff', boxShadow: '0 0 8px #0ff' }} /></div>
              <div className="stat-label"><span>STAMINA</span><span style={{ color: '#0f0' }}>{round(selected?.stamina)}</span></div>
              <div className="progress-container"><div className="progress-bar" style={{ width: `${round(selected?.stamina)}%`, background: '#0f0', boxShadow: '0 0 8px #0f0' }} /></div>
              <div className="stat-label"><span>FATIGUE</span><span style={{ color: '#f44' }}>{round(selected?.fatigue)}</span></div>
              <div className="progress-container"><div className="progress-bar" style={{ width: `${round(selected?.fatigue)}%`, background: '#f44', boxShadow: '0 0 8px #f44' }} /></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '18px', fontSize: '0.82rem' }}>
                <div><span style={{color:'#f44'}}>BLEEDING:</span> {round(selected?.bleeding)}</div>
                <div><span style={{color:'#ff0'}}>SICKNESS:</span> {round(selected?.sickness)}</div>
                <div><span style={{color:'#f80'}}>INFECTION:</span> {round(selected?.infection)}</div>
                <div><span style={{color:'#0ff'}}>TEMP:</span> {round(selected?.temperature)}°C</div>
                <div><span style={{color:'#f44'}}>BROKEN LIMB:</span> {selected?.broken_limb ? 'YES' : 'NO'}</div>
                <div><span style={{color:'#f44'}}>RIB FRACTURE:</span> {selected?.broken_ribs ? 'YES' : 'NO'}</div>
              </div>
              <div className="section-header" style={{ marginTop: '28px' }}>PHYSICAL &amp; COMBAT</div>
              <div style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
                <div><strong>WEIGHT:</strong> <span style={{color:'#ff0'}}>{realWeight} kg</span></div>
                <div><strong>HP:</strong> <span style={{color:'#0f0'}}>{realCurrentHp}</span> / <span style={{color:'#0ff'}}>{realMaxHp}</span></div>
                <div><strong>SPEED:</strong> <span style={{color:'#0ff'}}>{selected?.current_stats?.sprint_speed || 0}</span></div>
                <div><strong>COMBAT POWER:</strong> <span style={{color:'#f80'}}>{realCombatPower}</span></div>
              </div>
              <div className="see-more" onClick={() => setShowAdvanced(!showAdvanced)}>
                {showAdvanced ? '▲ HIDE ADVANCED STATS' : '▼ SEE MORE (ALL STATS)'}
              </div>
              {showAdvanced && (
                <div className="advanced-container" style={{ marginTop: '12px' }}>
                  <div className="section-header">ADVANCED STATS</div>
                  <div className="section-header" style={{ fontSize: '0.78rem', marginTop: '8px' }}>EMOTIONS &amp; DRIVES</div>
                  <div className="stat-row"><span>AGGRESSION</span><span>{round(selected?.aggression)}</span></div>
                  <div className="stat-row"><span>FEAR</span><span>{round(selected?.fear)}</span></div>
                  <div className="stat-row"><span>STRESS</span><span>{round(selected?.stress)}</span></div>
                  <div className="stat-row"><span>CONFIDENCE</span><span>{round(selected?.confidence)}</span></div>
                  <div className="stat-row"><span>COMFORT</span><span>{round(selected?.comfort)}</span></div>
                  <div className="stat-row"><span>CURIOSITY</span><span>{round(selected?.curiosity)}</span></div>
                  <div className="stat-row"><span>FRUSTRATION</span><span>{round(selected?.frustration)}</span></div>
                  <div className="stat-row"><span>BOREDOM</span><span>{round(selected?.boredom)}</span></div>
                  <div className="stat-row"><span>ALERTNESS</span><span>{round(selected?.alertness)}</span></div>
                  <div className="section-header" style={{ fontSize: '0.78rem', marginTop: '16px' }}>BEHAVIORAL TRAITS</div>
                  <div className="stat-row"><span>BOLDNESS</span><span>{round(selected?.boldness)}</span></div>
                  <div className="stat-row"><span>PATIENCE</span><span>{round(selected?.patience)}</span></div>
                  <div className="stat-row"><span>INTELLIGENCE</span><span>{round(selected?.intelligence)}</span></div>
                  <div className="stat-row"><span>LOYALTY</span><span>{round(selected?.loyalty)}</span></div>
                  <div className="stat-row"><span>OPPORTUNISM</span><span>{round(selected?.opportunism)}</span></div>
                  <div className="stat-row"><span>CAUTION</span><span>{round(selected?.caution)}</span></div>
                  <div className="section-header" style={{ fontSize: '0.78rem', marginTop: '16px' }}>SOCIAL GENETICS</div>
                  <div className="stat-row"><span>PACK AFFINITY</span><span>{round(selected?.pack_affinity)}</span></div>
                  <div className="stat-row"><span>SUBMISSION TENDENCY</span><span>{round(selected?.submission_tendency)}</span></div>
                  <div className="stat-row"><span>LEADERSHIP</span><span>{round(selected?.leadership)}</span></div>
                  <div className="stat-row"><span>EMPATHY</span><span>{round(selected?.empathy)}</span></div>
                  <div className="stat-row"><span>TOLERANCE</span><span>{round(selected?.tolerance)}</span></div>
                  <div className="section-header" style={{ fontSize: '0.78rem', marginTop: '16px' }}>COMBAT STYLE</div>
                  <div className="stat-row"><span>FEROCITY</span><span>{round(selected?.ferocity)}</span></div>
                  <div className="stat-row"><span>DEFENSIVENESS</span><span>{round(selected?.defensiveness)}</span></div>
                  <div className="stat-row"><span>TARGET FOCUS</span><span>{round(selected?.target_focus)}</span></div>
                  <div className="stat-row"><span>AMBUSH TENDENCY</span><span>{round(selected?.ambush_tendency)}</span></div>
                  <div className="stat-row"><span>RISK ASSESSMENT</span><span>{round(selected?.risk_assessment)}</span></div>
                  <div className="section-header" style={{ fontSize: '0.78rem', marginTop: '16px' }}>PERCEPTION</div>
                  <div className="stat-row"><span>VISION RANGE</span><span>{round(selected?.vision_range)}</span></div>
                  <div className="stat-row"><span>NIGHT VISION</span><span>{round(selected?.night_vision)}</span></div>
                  <div className="stat-row"><span>SMELL SENSITIVITY</span><span>{round(selected?.smell_sensitivity)}</span></div>
                  <div className="stat-row"><span>HEARING SENSITIVITY</span><span>{round(selected?.hearing_sensitivity)}</span></div>
                  <div className="section-header" style={{ fontSize: '0.78rem', marginTop: '16px' }}>URGES</div>
                  <div className="stat-row"><span>HUNGER URGE</span><span>{round(selected?.hunger_urge)}</span></div>
                  <div className="stat-row"><span>THIRST URGE</span><span>{round(selected?.thirst_urge)}</span></div>
                  <div className="stat-row"><span>REST URGE</span><span>{round(selected?.rest_urge)}</span></div>
                  <div className="stat-row"><span>SAFETY URGE</span><span>{round(selected?.safety_urge)}</span></div>
                  <div className="stat-row"><span>SOCIAL URGE</span><span>{round(selected?.social_urge)}</span></div>
                  <div className="stat-row"><span>ESCAPE URGE</span><span>{round(selected?.escape_urge)}</span></div>
                  <div className="section-header" style={{ fontSize: '0.78rem', marginTop: '16px' }}>STATE &amp; MISC</div>
                  <div className="stat-row"><span>STANCE</span><span>{selected?.stance || 'neutral'}</span></div>
                  <div className="stat-row"><span>GOAL PRIORITY</span><span>{round(selected?.goal_priority)}</span></div>
                  <div className="stat-row"><span>ENGAGED</span><span>{selected?.engaged ? 'YES' : 'NO'}</span></div>
                  <div className="stat-row"><span>REACTIVITY</span><span>{round(selected?.reactivity)}</span></div>
                  <div className="stat-row"><span>COMMITMENT</span><span>{round(selected?.commitment)}</span></div>
                  <div className="stat-row"><span>THREAT LEVEL</span><span>{round(selected?.threat_level)}</span></div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="panel footer-buttons" style={{ position: 'relative', zIndex: 10000 }}>
          <button
            ref={optionsButtonRef}
            className="btn"
            onClick={handleOptionsClick}
            onTouchEnd={handleOptionsClick}
            disabled={actionLoading}
            style={{ minWidth: '180px' }}
          >
            OPTIONS
          </button>
        </div>

        {showOptionsMenu && (
          <div ref={menuRef} className="options-menu">
            <div className="menu-item" onClick={handleGenerateEgg}>NEW EGG</div>
            <div className="menu-item" style={{ color: '#ff0' }} onClick={handleServerTick}>SERVER TICK</div>
            <div className="menu-item" style={{ color: '#0ff' }} onClick={handleRecalculate}>RECALC STATS</div>
            <div className="menu-item" style={{ color: '#f44' }} onClick={handleClearAllDinos}>CLEAR ALL</div>
            <div className="menu-item" style={{ color: '#0ff' }} onClick={handleEnterMap}>ENTER FOREST MAP</div>
          </div>
        )}

        {/* NEW MESSAGE BANNER */}
        {message && (
          <div style={{
            position: 'fixed',
            bottom: '30px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#111133',
            border: '4px solid #ff0',
            color: '#ff0',
            padding: '14px 28px',
            fontSize: '0.85rem',
            zIndex: 99999,
            boxShadow: '0 0 20px #ff0',
            textAlign: 'center',
            maxWidth: '90%'
          }}>
            {message}
          </div>
        )}
      </div>
    </>
  );
}