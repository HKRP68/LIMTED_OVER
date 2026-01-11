import React, { useState, useMemo, useRef } from 'react';
import { Tournament, WorkspaceTab, Team, Match, MatchResultType, PenaltyRecord } from '../types';
import BrutalistCard from './BrutalistCard';
import BrutalistButton from './BrutalistButton';
import { GoogleGenAI } from "@google/genai";
import html2canvas from 'html2canvas';

interface TournamentWorkspaceProps {
  tournament: Tournament;
  onExit: () => void;
  onUpdateTournament: (updated: Tournament) => void;
}

// Helper to convert overs (like 1.4) to true numeric value (1.666) for division
const toTrueOvers = (overs: number): number => {
  const integerPart = Math.floor(overs);
  const balls = (overs - integerPart) * 10;
  const validBalls = Math.min(Math.round(balls), 6);
  return integerPart + (validBalls / 6);
};

const TournamentWorkspace: React.FC<TournamentWorkspaceProps> = ({ tournament, onExit, onUpdateTournament }) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('DASHBOARD');
  const [selectedRoundNum, setSelectedRoundNum] = useState<number>(1);
  const [securityInput, setSecurityInput] = useState('');
  
  const pointsTableRef = useRef<HTMLDivElement>(null);
  const scheduleTableRef = useRef<HTMLDivElement>(null);

  // AI States (Standings Analyst only)
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Form States
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [confirmingAction, setConfirmingAction] = useState<{ type: string; matchId?: string; teamId?: string } | null>(null);
  const [loForm, setLoForm] = useState({
    t1Runs: 0, t1Wickets: 0, t1Overs: 0.0,
    t2Runs: 0, t2Wickets: 0, t2Overs: 0.0,
    notes: '', isDls: false, isAbandoned: false
  });

  // Helper for logo upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (base64: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        callback(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDownloadImage = async (ref: React.RefObject<HTMLDivElement | null>, filename: string) => {
    if (!ref.current) return;
    try {
      const canvas = await html2canvas(ref.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
        windowWidth: ref.current.scrollWidth + 100
      });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `${filename}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Image capture failed', err);
      alert('Failed to generate image. Please try again.');
    }
  };

  // AI Actions
  const handleStandingsAnalysis = async (deepThink: boolean) => {
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Act as a world-class cricket analyst. Analyze the following standings and provide a brief, professional, yet bold commentary on which teams are doing well, who is struggling, and what the NRR suggests about their future in the tournament. Standings: ${JSON.stringify(standings)}`;
      
      const response = await ai.models.generateContent({
        model: deepThink ? 'gemini-3-pro-preview' : 'gemini-2.5-flash-lite-latest',
        contents: prompt,
        config: deepThink ? { thinkingConfig: { thinkingBudget: 32768 } } : undefined
      });

      setAiAnalysis(response.text || 'No analysis available.');
    } catch (e) {
      console.error(e);
      alert("AI analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- LOGIC: SCHEDULE GENERATION ---
  const handleGenerateSchedule = () => {
    const teams = tournament.teams;
    if (teams.length < 2) return alert("LOGIC ERROR: Need at least 2 teams!");

    const matches: Match[] = [];
    const teamPool = [...teams];
    if (teamPool.length % 2 !== 0) {
      teamPool.push({ id: 'BYE', name: 'BYE' } as any);
    }
    
    const numRounds = teamPool.length - 1;
    const matchesPerRound = teamPool.length / 2;

    for (let r = 0; r < numRounds; r++) {
      for (let m = 0; m < matchesPerRound; m++) {
        const t1 = teamPool[m];
        const t2 = teamPool[teamPool.length - 1 - m];
        
        if (t1.id !== 'BYE' && t2.id !== 'BYE') {
          const venue = tournament.stadiums[Math.floor(Math.random() * tournament.stadiums.length)];
          matches.push({
            id: `M-R${r + 1}-${m}-${Date.now()}`,
            round: r + 1,
            team1Id: t1.id,
            team2Id: t2.id,
            venueId: venue?.id || 'neutral',
            status: 'NOT_STARTED'
          });
        }
      }
      teamPool.splice(1, 0, teamPool.pop()!);
    }

    onUpdateTournament({ ...tournament, matches, status: 'UPCOMING' });
    setConfirmingAction(null);
    setSecurityInput('');
    alert("SCHEDULE GENERATED SUCCESSFULLY!");
    setActiveTab('SCHEDULE');
  };

  const handleRegenerateSchedule = () => {
    if (securityInput !== tournament.name) return alert("SECURITY ALERT: Validation Failed! Type name exactly.");
    handleGenerateSchedule();
  };

  // --- LOGIC: STANDINGS & NRR ---
  const standings = useMemo(() => {
    const data = tournament.teams.map(team => {
      const matches = tournament.matches.filter(m => (m.team1Id === team.id || m.team2Id === team.id) && m.status === 'COMPLETED');
      let mp = 0, mw = 0, ml = 0, mt = 0, nr = 0, pts = 0;
      let totalRunsScored: number = 0;
      let totalTrueOversFaced: number = 0;
      let totalRunsConceded: number = 0;
      let totalTrueOversBowled: number = 0;
      let form: string[] = [];

      matches.forEach(m => {
        mp++;
        const isT1 = m.team1Id === team.id;
        const res = m.resultType;
        const maxO = parseFloat(tournament.config.oversPerMatch) || 0;

        if ((isT1 && res === 'T1_WIN') || (!isT1 && res === 'T2_WIN')) {
          mw++; pts += tournament.config.pointsForWin; form.push('W');
        } else if (res === 'TIE') {
          mt++; pts += tournament.config.pointsForDraw; form.push('T');
        } else if (res === 'NO_RESULT' || res === 'ABANDONED') {
          nr++; pts += tournament.config.pointsForDraw; form.push('NR');
        } else {
          ml++; pts += tournament.config.pointsForLoss; form.push('L');
        }

        if (res !== 'ABANDONED' && res !== 'NO_RESULT' && m.t1Runs !== undefined && m.t2Runs !== undefined) {
          const rS = isT1 ? (m.t1Runs ?? 0) : (m.t2Runs ?? 0);
          const wS = isT1 ? (m.t1Wickets ?? 0) : (m.t2Wickets ?? 0);
          const oS = isT1 ? (m.t1Overs ?? 0) : (m.t1Overs ?? 0);
          const rC = isT1 ? (m.t2Runs ?? 0) : (m.t1Runs ?? 0);
          const wC = isT1 ? (m.t2Wickets ?? 0) : (m.t1Wickets ?? 0);
          const oC = isT1 ? (m.t2Overs ?? 0) : (m.t1Overs ?? 0);

          totalRunsScored += rS;
          totalRunsConceded += rC;
          totalTrueOversFaced += (wS === 10) ? maxO : toTrueOvers(oS);
          totalTrueOversBowled += (wC === 10) ? maxO : toTrueOvers(oC);
        }
      });

      const penPts = tournament.penalties.filter(p => p.teamId === team.id).reduce((s, p) => s + (p.points || 0), 0);
      const nrr = (totalTrueOversFaced > 0 && totalTrueOversBowled > 0) ? (totalRunsScored / totalTrueOversFaced) - (totalRunsConceded / totalTrueOversBowled) : 0;
      return { ...team, mp, mw, ml, mt, nr, pts: Math.max(0, pts - penPts), nrr, form: form.slice(-5).reverse() };
    });

    return data.sort((a, b) => {
      const ptsDiff = (b.pts || 0) - (a.pts || 0);
      if (ptsDiff !== 0) return ptsDiff;
      const nrrDiff = (b.nrr || 0) - (a.nrr || 0);
      if (nrrDiff !== 0) return nrrDiff;
      const mwDiff = (b.mw || 0) - (a.mw || 0);
      if (mwDiff !== 0) return mwDiff;
      return a.name.localeCompare(b.name);
    });
  }, [tournament]);

  // --- ACTIONS: UPDATES ---
  const updateConfig = (key: keyof typeof tournament.config, value: any) => {
    onUpdateTournament({ ...tournament, config: { ...tournament.config, [key]: value } });
  };

  const updateTournamentDetail = (key: keyof Tournament, value: any) => {
    onUpdateTournament({ ...tournament, [key]: value });
  };

  const updateTeam = (updated: Team) => {
    onUpdateTournament({ ...tournament, teams: tournament.teams.map(t => t.id === updated.id ? updated : t) });
    setEditingTeam(null);
  };

  const saveMatchResult = () => {
    const mId = confirmingAction?.matchId;
    if (!mId) return;
    const match = tournament.matches.find(m => m.id === mId)!;
    
    let res: MatchResultType = 'TIE';
    if (!loForm.isAbandoned) {
      if (loForm.t1Runs > loForm.t2Runs) res = 'T1_WIN';
      else if (loForm.t2Runs > loForm.t1Runs) res = 'T2_WIN';
    } else {
      res = 'ABANDONED';
    }

    const updatedMatch: Match = {
      ...match,
      status: 'COMPLETED',
      resultType: res,
      t1Runs: loForm.t1Runs, t1Wickets: loForm.t1Wickets, t1Overs: loForm.t1Overs,
      t2Runs: loForm.t2Runs, t2Wickets: loForm.t2Wickets, t2Overs: loForm.t2Overs,
      notes: loForm.notes, isDlsApplied: loForm.isDls
    };

    onUpdateTournament({
      ...tournament,
      matches: tournament.matches.map(m => m.id === mId ? updatedMatch : m),
      status: 'ONGOING'
    });
    setConfirmingAction(null);
  };

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tournament, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${tournament.name.replace(/\s+/g, '_')}_Backup.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  // --- RENDER: DASHBOARD ---
  const renderDashboard = () => {
    const total = tournament.matches.length;
    const completed = tournament.matches.filter(m => m.status === 'COMPLETED').length;
    const ongoing = tournament.matches.filter(m => m.status === 'IN_PROGRESS').length;
    const remaining = total - completed - ongoing;
    const rounds = Array.from(new Set(tournament.matches.map(m => m.round))).sort((a: number, b: number) => a - b);

    if (total === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-20 text-center space-y-12 bg-white/40 brutalist-border shadow-[20px_20px_0px_black] animate-pulse">
          <h2 className="text-8xl font-black uppercase italic tracking-tighter opacity-10 text-black">NO DATA LOGGED</h2>
          <div className="space-y-4">
            <p className="font-black text-xl uppercase tracking-widest text-gray-500">Schedule Engine is Ready for Initialization</p>
            <BrutalistButton variant="primary" className="text-5xl py-12 px-24 shadow-[15px_15px_0px_black]" onClick={handleGenerateSchedule}>
              GENERATE SCHEDULE
            </BrutalistButton>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-10 animate-in fade-in slide-in-from-bottom-5 duration-700">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { label: 'Total Matches', val: total, color: 'bg-white' },
            { label: 'Completed', val: completed, color: 'bg-emerald-400' },
            { label: 'Ongoing', val: ongoing, color: 'bg-sky-400' },
            { label: 'Remaining', val: remaining, color: 'bg-rose-400' }
          ].map((stat, i) => (
            <BrutalistCard key={i} className={`${stat.color} flex flex-col items-center justify-center p-8 shadow-[10px_10px_0px_black]`}>
              <span className="text-7xl font-black leading-none text-black">{stat.val}</span>
              <span className="text-[10px] font-black uppercase mt-2 tracking-widest opacity-60 text-black">{stat.label}</span>
            </BrutalistCard>
          ))}
        </div>

        <BrutalistCard title="ROUND PROGRESS TRACKER" variant="yellow">
          <div className="flex h-16 brutalist-border overflow-hidden shadow-[8px_8px_0px_black] bg-gray-100">
            {rounds.map(rNum => {
              const roundMatches = tournament.matches.filter(m => m.round === rNum);
              const done = roundMatches.every(m => m.status === 'COMPLETED');
              const progress = roundMatches.some(m => m.status === 'COMPLETED' || m.status === 'IN_PROGRESS');
              const color = done ? 'bg-emerald-400' : progress ? 'bg-yellow-400' : 'bg-gray-300';
              return (
                <div key={rNum} className={`flex-1 ${color} border-r-2 border-black last:border-r-0 flex items-center justify-center font-black group relative cursor-help text-black`}>
                  R{rNum}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-black text-white p-2 text-[9px] brutalist-border z-50 whitespace-nowrap">
                    {roundMatches.filter(m => m.status === 'COMPLETED').length}/{roundMatches.length} COMPLETED
                  </div>
                </div>
              );
            })}
          </div>
        </BrutalistCard>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 text-black">
          <BrutalistCard title="QUALIFICATION LADDER" className="lg:col-span-2">
            <div className="space-y-2">
              {standings.map((t, i) => {
                const qualified = i < 4;
                const borderline = i === 4;
                return (
                  <div key={t.id} className={`flex items-center gap-4 p-4 brutalist-border transition-all ${qualified ? 'bg-emerald-100 shadow-[4px_4px_0px_#10b981]' : borderline ? 'bg-yellow-50 shadow-[4px_4px_0px_#eab308]' : 'bg-white'}`}>
                    <span className="font-black text-xl w-8 text-center">{i+1}</span>
                    <span className="font-black flex-grow uppercase">{t.name}</span>
                    <span className="mono font-bold">{t.pts} PTS</span>
                    <span className={`mono text-xs font-black ${(t.nrr || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{(t.nrr || 0).toFixed(3)}</span>
                  </div>
                );
              })}
            </div>
          </BrutalistCard>

          <BrutalistCard title="ALERTS & WARNINGS" variant="magenta">
            <div className="space-y-4">
              {standings.some((t, idx) => standings[idx + 1] && t.pts === standings[idx + 1].pts) && (
                <div className="p-3 bg-yellow-400 brutalist-border font-black text-[10px] uppercase text-black">
                  ⚠️ TIE ALERT: Multiple teams on same points. Resolution via NRR.
                </div>
              )}
              {tournament.matches.some(m => m.isDlsApplied) && (
                <div className="p-3 bg-sky-400 brutalist-border font-black text-[10px] uppercase text-black">
                  🌧️ DLS ALERT: Matches revised due to rain impact.
                </div>
              )}
              {tournament.matches.filter(m => m.status === 'NOT_STARTED').length > 0 ? (
                <div className="p-3 bg-gray-200 brutalist-border font-black text-[10px] uppercase text-black">
                  STATUS: {tournament.matches.filter(m => m.status === 'COMPLETED').length} Matches logged.
                </div>
              ) : (
                <div className="p-3 bg-emerald-400 brutalist-border font-black text-[10px] uppercase text-black">
                  🏆 TOURNAMENT COMPLETED
                </div>
              )}
            </div>
          </BrutalistCard>
        </div>
      </div>
    );
  };

  // --- RENDER: TOURNAMENT INFO ---
  const renderInfo = () => {
    const isLocked = tournament.matches.some(m => m.status === 'COMPLETED');
    
    return (
      <div className="space-y-10 animate-in fade-in duration-500 pb-20 text-black">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <BrutalistCard title="IDENTITY & FORMAT" variant="cyan">
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase mb-1">Tournament Name</label>
                  <input 
                    className="w-full brutalist-border p-3 font-black bg-white text-black uppercase text-xl" 
                    value={tournament.name} 
                    onChange={e => updateTournamentDetail('name', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase mb-1">Season</label>
                  <input 
                    className="w-full brutalist-border p-3 font-black bg-white text-black uppercase text-xl" 
                    value={tournament.season || ''} 
                    placeholder="E.G. 2025"
                    onChange={e => updateTournamentDetail('season', e.target.value)}
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-[10px] font-black uppercase mb-1">Overs Per Match {isLocked && <span className="text-rose-600 font-bold">(LOCKED)</span>}</label>
                <div className="flex gap-2">
                  <input 
                    type="number" 
                    className="flex-grow brutalist-border p-3 font-black bg-white text-black text-3xl" 
                    placeholder="Overs"
                    value={tournament.config.oversPerMatch}
                    onChange={e => updateConfig('oversPerMatch', e.target.value)}
                    disabled={isLocked}
                  />
                  <div className="bg-black text-white px-6 flex items-center brutalist-border font-black text-xl italic uppercase shadow-[4px_4px_0px_black]">OVERS</div>
                </div>
                <p className="mt-2 text-[9px] font-bold text-gray-500 uppercase tracking-widest">Type any number. Change only before scoring matches.</p>
              </div>

              <div className="flex gap-4">
                <button onClick={()=>updateConfig('superOverAllowed', !tournament.config.superOverAllowed)} className={`flex-1 p-3 brutalist-border font-black text-[10px] uppercase text-black ${tournament.config.superOverAllowed ? 'bg-emerald-400' : 'bg-white'}`}>SUPER OVER: {tournament.config.superOverAllowed ? 'YES' : 'NO'}</button>
                <button onClick={()=>updateConfig('dlsEnabled', !tournament.config.dlsEnabled)} className={`flex-1 p-3 brutalist-border font-black text-[10px] uppercase text-black ${tournament.config.dlsEnabled ? 'bg-sky-400' : 'bg-white'}`}>DLS ENGINE: {tournament.config.dlsEnabled ? 'ON' : 'OFF'}</button>
              </div>
            </div>
          </BrutalistCard>

          <BrutalistCard title="PARTICIPATION HUB" variant="lime">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-4 bg-white brutalist-border shadow-[4px_4px_0px_black] text-black">
                <span className="block text-[8px] font-black opacity-50 uppercase">TEAMS</span>
                <span className="text-4xl font-black">{tournament.teams.length}</span>
              </div>
              <div className="p-4 bg-white brutalist-border shadow-[4px_4px_0px_black] text-black">
                <span className="block text-[8px] font-black opacity-50 uppercase">ROUNDS</span>
                <span className="text-4xl font-black">{new Set(tournament.matches.map(m=>m.round)).size || '0'}</span>
              </div>
              <div className="p-4 bg-white brutalist-border shadow-[4px_4px_0px_black] text-black">
                <span className="block text-[8px] font-black opacity-50 uppercase">MATCHES</span>
                <span className="text-4xl font-black">{tournament.matches.length}</span>
              </div>
            </div>
            
            <div className="mt-8 space-y-4">
              <div className="p-4 bg-black text-white brutalist-border shadow-[6px_6px_0px_#84cc16]">
                <span className="block text-[10px] font-black opacity-60 uppercase mb-2">OPERATIONAL STATUS</span>
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${tournament.matches.length > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`}></div>
                  <span className="text-2xl font-black italic uppercase tracking-tighter">
                    {tournament.matches.length > 0 ? 'ENGINE INITIALIZED' : 'AWAITING SCHEDULE'}
                  </span>
                </div>
              </div>
              
              {tournament.matches.length === 0 && (
                <BrutalistButton variant="primary" className="w-full py-6 text-2xl" onClick={handleGenerateSchedule}>
                  INITIALIZE ENGINE
                </BrutalistButton>
              )}
            </div>
          </BrutalistCard>

          <BrutalistCard title="POINT SYSTEM CONFIG" variant="yellow" className="col-span-full">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div>
                  <label className="block text-[10px] font-black uppercase mb-1">WIN POINTS</label>
                  <input type="number" className="w-full brutalist-border p-5 font-black text-4xl text-center shadow-[4px_4px_0px_black] bg-white text-black" value={tournament.config.pointsForWin} onChange={e=>updateConfig('pointsForWin', parseInt(e.target.value)||0)} />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase mb-1">TIE / NO RESULT</label>
                  <input type="number" className="w-full brutalist-border p-5 font-black text-4xl text-center shadow-[4px_4px_0px_black] bg-white text-black" value={tournament.config.pointsForDraw} onChange={e=>updateConfig('pointsForDraw', parseInt(e.target.value)||0)} />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase mb-1">LOSS POINTS</label>
                  <input type="number" className="w-full brutalist-border p-5 font-black text-4xl text-center shadow-[4px_4px_0px_black] bg-white text-black" value={tournament.config.pointsForLoss} onChange={e=>updateConfig('pointsForLoss', parseInt(e.target.value)||0)} />
                </div>
             </div>
          </BrutalistCard>

          <BrutalistCard title="TEAM IDENTITIES" className="col-span-full">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {tournament.teams.map(t => (
                  <div key={t.id} className="brutalist-border p-4 bg-white shadow-[6px_6px_0px_black] hover:-translate-y-1 transition-transform group text-black">
                     <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 brutalist-border bg-black text-white flex items-center justify-center p-1">
                          {t.logoUrl ? <img src={t.logoUrl} className="max-h-full" /> : <span className="font-black text-xl">{t.name[0]}</span>}
                        </div>
                        <div className="flex-grow">
                          <h4 className="font-black text-sm uppercase leading-none">{t.name}</h4>
                          <span className="text-[9px] font-bold opacity-40 uppercase">Owner: {t.owner || 'Undeclared'}</span>
                        </div>
                     </div>
                     <BrutalistButton variant="magenta" compact className="w-full" onClick={()=>setEditingTeam(t)}>EDIT INFO</BrutalistButton>
                  </div>
                ))}
             </div>
          </BrutalistCard>
        </div>

        <div className="flex justify-end gap-6 pt-10">
          <BrutalistButton variant="primary" className="px-12 py-5 text-2xl shadow-[8px_8px_0px_black]" onClick={handleExport}>EXPORT BACKUP (.JSON)</BrutalistButton>
          <BrutalistButton variant="success" className="px-12 py-5 text-2xl shadow-[8px_8px_0px_black]" onClick={() => window.print()}>GENERATE PDF REPORT</BrutalistButton>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-10 pb-60">
      <nav className="flex flex-wrap gap-4 sticky top-[100px] z-[40] bg-gray-200/95 backdrop-blur-xl p-6 border-b-8 border-black -mx-10 px-10">
        {[
          { id: 'DASHBOARD', label: 'LIVE DASHBOARD' },
          { id: 'SCHEDULE', label: 'SCHEDULE HUB' },
          { id: 'POINTS', label: 'STANDINGS' },
          { id: 'INFO', label: 'TOURNAMENT INFO' },
          { id: 'SETTINGS', label: 'ADMIN SETTINGS' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as WorkspaceTab)}
            className={`px-10 py-5 font-black uppercase text-xs brutalist-border transition-all ${activeTab === tab.id ? 'bg-black text-white translate-x-2 translate-y-2 shadow-none' : 'bg-white text-black hover:bg-yellow-400 brutalist-shadow-active'}`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main>
        {activeTab === 'DASHBOARD' && renderDashboard()}
        {activeTab === 'INFO' && renderInfo()}
        {activeTab === 'SCHEDULE' && (
          <div className="space-y-6">
            <BrutalistCard title="SCHEDULE MANAGEMENT" variant="white">
               {tournament.matches.length === 0 ? (
                 <div className="py-20 text-center space-y-8">
                    <p className="font-black text-3xl uppercase tracking-tighter opacity-30 text-black">NO MATCHES GENERATED YET</p>
                    <BrutalistButton variant="primary" className="text-3xl py-8 px-16" onClick={handleGenerateSchedule}>INITIALIZE SCHEDULE HUB</BrutalistButton>
                 </div>
               ) : (
                 <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
                        {Array.from(new Set(tournament.matches.map(m=>m.round))).sort((a:number,b:number)=>a-b).map(r => (
                          <button key={r} onClick={()=>setSelectedRoundNum(r)} className={`p-3 brutalist-border font-black text-xs ${selectedRoundNum === r ? 'bg-black text-white shadow-none' : 'bg-white text-black hover:bg-yellow-50 shadow-[4px_4px_0px_black]'}`}>ROUND {r}</button>
                        ))}
                    </div>
                    <BrutalistButton variant="info" onClick={() => handleDownloadImage(scheduleTableRef, `Round_${selectedRoundNum}_Schedule`)}>DOWNLOAD AS IMAGE</BrutalistButton>
                  </div>

                  <div ref={scheduleTableRef} className="bg-white p-6 brutalist-border shadow-[10px_10px_0px_black]">
                      <div className="mb-4 flex items-center justify-between border-b-4 border-black pb-2">
                        <h2 className="text-2xl font-black uppercase italic tracking-tighter">{tournament.name} - Round {selectedRoundNum}</h2>
                        <span className="mono text-[10px] font-bold uppercase">{new Date().toLocaleDateString()}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead className="bg-black text-white text-[10px] font-black uppercase">
                              <tr><th className="p-4">MATCHUP</th><th className="p-4">VENUE</th><th className="p-4 text-center">STATUS</th><th className="p-4 text-center">SCORECARD</th></tr>
                          </thead>
                          <tbody className="divide-y-2 divide-black bg-white text-black">
                              {tournament.matches.filter(m=>m.round === selectedRoundNum).map(m => {
                                const t1 = tournament.teams.find(t=>t.id===m.team1Id);
                                const t2 = tournament.teams.find(t=>t.id===m.team2Id);
                                const v = tournament.stadiums.find(s=>s.id===m.venueId);
                                return (
                                  <tr key={m.id} className="hover:bg-yellow-50">
                                    <td className="p-4 font-black uppercase text-sm">{t1?.name} VS {t2?.name}</td>
                                    <td className="p-4 font-bold uppercase text-[10px] text-gray-500">{v?.name || 'NEUTRAL'}</td>
                                    <td className="p-4 text-center">
                                      <span className={`px-2 py-1 brutalist-border text-[8px] font-black uppercase ${m.status==='COMPLETED'?'bg-emerald-400 text-black':'bg-gray-200 text-gray-600'}`}>{m.status}</span>
                                    </td>
                                    <td className="p-4 text-center">
                                      <BrutalistButton variant="magenta" compact onClick={() => {
                                        setConfirmingAction({ type: 'SAVE_RESULT', matchId: m.id });
                                        setLoForm({
                                          t1Runs: m.t1Runs || 0, t1Wickets: m.t1Wickets || 0, t1Overs: m.t1Overs || 0,
                                          t2Runs: m.t2Runs || 0, t2Wickets: m.t2Wickets || 0, t2Overs: m.t2Overs || 0,
                                          notes: m.notes || '', isDls: m.isDlsApplied || false, isAbandoned: m.resultType === 'ABANDONED'
                                        });
                                      }}>{m.status === 'COMPLETED' ? 'EDIT RESULTS' : 'FILL SCORECARD'}</BrutalistButton>
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                  </div>
                 </div>
               )}
            </BrutalistCard>
          </div>
        )}
        {activeTab === 'POINTS' && (
          <div className="space-y-8">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <h2 className="text-4xl font-black uppercase italic tracking-tighter">OFFICIAL STANDINGS</h2>
              <div className="flex gap-4">
                <BrutalistButton variant="info" className="py-4 shadow-[8px_8px_0px_black]" onClick={() => handleDownloadImage(pointsTableRef, `${tournament.name.replace(/\s+/g, '_')}_Standings`)}>
                  DOWNLOAD AS IMAGE
                </BrutalistButton>
              </div>
            </div>
            
            <div ref={pointsTableRef} className="bg-white p-6 md:p-10 brutalist-border shadow-[15px_15px_0px_black] capture-area max-w-full overflow-hidden">
               <div className="mb-6 border-b-8 border-black pb-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-6">
                    {tournament.header?.tournamentLogoUrl && (
                      <img src={tournament.header.tournamentLogoUrl} className="h-20 brutalist-border bg-black p-1 shadow-[4px_4px_0px_black]" alt="T-Logo" />
                    )}
                    <div>
                      <h1 className="text-5xl font-black uppercase italic tracking-tighter leading-none">{tournament.name}</h1>
                      <p className="mono font-bold text-xs uppercase tracking-[0.3em] mt-2 opacity-60">Season {tournament.season || '2025'} | Official Points Table</p>
                    </div>
                  </div>
               </div>
               
               <div className="overflow-x-auto brutalist-border">
                  <table className="w-full text-left border-collapse font-black">
                     <thead className="bg-black text-white uppercase text-xs tracking-widest">
                        <tr>
                          <th className="p-5 border-r border-white/20 text-center w-16">#</th>
                          <th className="p-5 border-r border-white/20">TEAM</th>
                          <th className="p-5 text-center border-r border-white/20 w-16">MP</th>
                          <th className="p-5 text-center border-r border-white/20 w-16 text-emerald-400">W</th>
                          <th className="p-5 text-center border-r border-white/20 w-16 text-rose-400">L</th>
                          <th className="p-5 text-center border-r border-white/20 w-32 text-yellow-400">NRR</th>
                          <th className="p-5 text-center bg-gray-800 w-24">PTS</th>
                          <th className="p-5 text-center w-48">FORM (L5)</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y-2 divide-black bg-white text-black text-lg">
                        {standings.map((t, i) => (
                          <tr key={t.id} className={`${i < 4 ? 'bg-emerald-50' : 'bg-white'} hover:bg-yellow-50 transition-colors`}>
                            <td className={`p-4 text-3xl font-black text-center border-r border-black/10 ${i < 4 ? 'text-emerald-700' : 'text-black'}`}>{i+1}</td>
                            <td className="p-4 border-r border-black/10">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 flex-shrink-0 brutalist-border bg-gray-100 flex items-center justify-center p-0.5">
                                  {t.logoUrl ? <img src={t.logoUrl} className="max-h-full" /> : <span className="text-xs">{t.name[0]}</span>}
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-xl italic tracking-tighter uppercase leading-none">{t.name}</span>
                                  <span className="text-[9px] font-bold opacity-40 uppercase tracking-widest mt-1">{t.owner || 'Undeclared'}</span>
                                </div>
                              </div>
                            </td>
                            <td className="p-4 text-center border-r border-black/10 font-bold">{t.mp}</td>
                            <td className="p-4 text-center border-r border-black/10 text-emerald-600 font-black">{t.mw}</td>
                            <td className="p-4 text-center border-r border-black/10 text-rose-600 font-black">{t.ml}</td>
                            <td className={`p-4 text-center border-r border-black/10 font-black text-lg ${(t.nrr || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {(t.nrr || 0).toFixed(3)}
                            </td>
                            <td className="p-4 text-center bg-gray-100 text-4xl font-black border-l-2 border-black">{t.pts}</td>
                            <td className="p-4">
                              <div className="flex gap-1.5 justify-center">
                                {t.form.map((f,idx)=>(
                                  <span key={idx} className={`w-7 h-7 flex items-center justify-center text-[9px] text-white brutalist-border shadow-[2px_2px_0px_black] ${f==='W'?'bg-emerald-500':f==='L'?'bg-rose-500':'bg-gray-400'}`}>
                                    {f}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
               
               <div className="mt-6 pt-4 border-t-2 border-dashed border-black flex justify-between items-center opacity-60">
                 <div className="mono text-[8px] uppercase font-bold">
                   Tie-break: Points > NRR > Head-to-Head | Generated {new Date().toLocaleDateString()}
                 </div>
                 <div className="text-right italic font-black uppercase text-[10px]">
                   CAD MANAGEMENT HUB v1.2.1
                 </div>
               </div>
            </div>

            <BrutalistCard title="GEMINI INTELLIGENCE: STANDINGS ANALYST" variant="cyan">
              <div className="space-y-6">
                <div className="flex gap-4">
                  <BrutalistButton 
                    variant="info" 
                    className="flex-1 py-6 text-lg shadow-[8px_8px_0px_black]"
                    onClick={() => handleStandingsAnalysis(false)}
                    disabled={isAnalyzing}
                  >
                    {isAnalyzing ? 'FLASH ANALYZING...' : 'FAST AI INSIGHT (FLASH-LITE)'}
                  </BrutalistButton>
                  <BrutalistButton 
                    variant="accent" 
                    className="flex-1 py-6 text-lg shadow-[8px_8px_0px_black]"
                    onClick={() => handleStandingsAnalysis(true)}
                    disabled={isAnalyzing}
                  >
                    {isAnalyzing ? 'DEEP THINKING...' : 'DEEP SCENARIO ANALYSIS (PRO)'}
                  </BrutalistButton>
                </div>
                
                {aiAnalysis && (
                  <div className="p-8 brutalist-border bg-black text-white mono text-base uppercase leading-relaxed animate-in slide-in-from-top-4 duration-500 shadow-[10px_10px_0px_#22d3ee]">
                    <div className="flex items-center gap-3 mb-4 border-b border-white/20 pb-2">
                      <div className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse"></div>
                      <span className="text-[10px] font-bold tracking-widest text-cyan-400">ANALYSIS REPORT</span>
                    </div>
                    {aiAnalysis}
                  </div>
                )}
              </div>
            </BrutalistCard>
          </div>
        )}
        {activeTab === 'SETTINGS' && (
          <BrutalistCard title="ADMINISTRATIVE OVERRIDE" variant="yellow">
             <div className="py-20 text-center space-y-10">
                <h2 className="text-8xl font-black uppercase italic tracking-tighter leading-none transform -rotate-1 text-black">CRITICAL ACCESS</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
                   <BrutalistButton variant="danger" className="py-12 text-3xl shadow-[12px_12px_0px_black]" onClick={()=>setConfirmingAction({type:'REGENERATE_SCHEDULE'})}>SYSTEM HARD RESET</BrutalistButton>
                   <BrutalistButton variant="magenta" className="py-12 text-3xl shadow-[12px_12px_0px_black]" onClick={handleExport}>EXPORT DB</BrutalistButton>
                   <BrutalistButton variant="success" className="py-12 text-3xl shadow-[12px_12px_0px_black]" onClick={()=>window.location.reload()}>SYNC CLOUD</BrutalistButton>
                </div>
             </div>
          </BrutalistCard>
        )}
      </main>

      {/* MODAL: EDIT TEAM */}
      {editingTeam && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-6 animate-in zoom-in-95 duration-200">
           <BrutalistCard title={`EDIT TEAM IDENTITY: ${editingTeam.name}`} className="max-w-md w-full bg-white border-8 shadow-[15px_15px_0px_white]">
              <div className="space-y-6 p-4 text-black">
                 <div>
                    <label className="block text-[10px] font-black uppercase mb-1">Team Name</label>
                    <input className="w-full brutalist-border p-3 font-black uppercase bg-white text-black" value={editingTeam.name} onChange={e=>setEditingTeam({...editingTeam, name: e.target.value})} />
                 </div>
                 <div>
                    <label className="block text-[10px] font-black uppercase mb-1">UPLOAD NEW LOGO</label>
                    <input 
                      type="file"
                      accept="image/*"
                      className="w-full brutalist-border p-3 font-bold bg-white text-black outline-none cursor-pointer" 
                      onChange={e => handleLogoUpload(e, (base64) => setEditingTeam({...editingTeam, logoUrl: base64}))}
                    />
                 </div>
                 <div>
                    <label className="block text-[10px] font-black uppercase mb-1">Owner Name</label>
                    <input className="w-full brutalist-border p-3 font-black uppercase bg-white text-black" value={editingTeam.owner || ''} onChange={e=>setEditingTeam({...editingTeam, owner: e.target.value})} />
                 </div>
                 <div className="flex gap-4 pt-4">
                    <BrutalistButton variant="success" className="flex-1 py-4 text-xl" onClick={()=>updateTeam(editingTeam)}>SAVE</BrutalistButton>
                    <BrutalistButton variant="secondary" className="flex-1 py-4 text-xl" onClick={()=>setEditingTeam(null)}>CANCEL</BrutalistButton>
                 </div>
              </div>
           </BrutalistCard>
        </div>
      )}

      {/* MODAL: SCORECARD ENTRY */}
      {confirmingAction?.type === 'SAVE_RESULT' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md p-6 animate-in zoom-in-95 duration-200 overflow-y-auto">
          <BrutalistCard title="LIMITED OVERS SCORECARD ENGINE" className="max-w-4xl w-full bg-white border-8 shadow-[30px_30px_0px_white]">
            <div className="space-y-8 p-4 text-black">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="p-8 brutalist-border bg-emerald-50 shadow-[10px_10px_0px_#10b981]">
                    <h4 className="font-black uppercase text-2xl mb-6 border-b-4 border-black pb-2">{tournament.teams.find(t=>t.id===tournament.matches.find(m=>m.id===confirmingAction.matchId)?.team1Id)?.name}</h4>
                    <div className="grid grid-cols-3 gap-6">
                       <div className="space-y-2">
                          <label className="block text-[10px] font-black uppercase">RUNS</label>
                          <input type="number" className="w-full brutalist-border p-4 font-black text-4xl text-center focus:bg-white bg-white text-black" value={loForm.t1Runs} onChange={e=>setLoForm({...loForm, t1Runs: parseInt(e.target.value)||0})} />
                       </div>
                       <div className="space-y-2">
                          <label className="block text-[10px] font-black uppercase">WKT</label>
                          <input type="number" className="w-full brutalist-border p-4 font-black text-4xl text-center text-rose-600 focus:bg-white bg-white" value={loForm.t1Wickets} onChange={e=>setLoForm({...loForm, t1Wickets: parseInt(e.target.value)||0})} />
                       </div>
                       <div className="space-y-2">
                          <label className="block text-[10px] font-black uppercase">OVERS</label>
                          <input type="number" step="0.1" className="w-full brutalist-border p-4 font-black text-4xl text-center focus:bg-white bg-white text-black" value={loForm.t1Overs} onChange={e=>setLoForm({...loForm, t1Overs: parseFloat(e.target.value)||0})} />
                       </div>
                    </div>
                 </div>
                 <div className="p-8 brutalist-border bg-sky-50 shadow-[10px_10px_0px_#0ea5e9]">
                    <h4 className="font-black uppercase text-2xl mb-6 border-b-4 border-black pb-2">{tournament.teams.find(t=>t.id===tournament.matches.find(m=>m.id===confirmingAction.matchId)?.team2Id)?.name}</h4>
                    <div className="grid grid-cols-3 gap-6">
                       <div className="space-y-2">
                          <label className="block text-[10px] font-black uppercase">RUNS</label>
                          <input type="number" className="w-full brutalist-border p-4 font-black text-4xl text-center focus:bg-white bg-white text-black" value={loForm.t2Runs} onChange={e=>setLoForm({...loForm, t2Runs: parseInt(e.target.value)||0})} />
                       </div>
                       <div className="space-y-2">
                          <label className="block text-[10px] font-black uppercase">WKT</label>
                          <input type="number" className="w-full brutalist-border p-4 font-black text-4xl text-center text-rose-600 focus:bg-white bg-white" value={loForm.t2Wickets} onChange={e=>setLoForm({...loForm, t2Wickets: parseInt(e.target.value)||0})} />
                       </div>
                       <div className="space-y-2">
                          <label className="block text-[10px] font-black uppercase">OVERS</label>
                          <input type="number" step="0.1" className="w-full brutalist-border p-4 font-black text-4xl text-center focus:bg-white bg-white text-black" value={loForm.t2Overs} onChange={e=>setLoForm({...loForm, t2Overs: parseFloat(e.target.value)||0})} />
                       </div>
                    </div>
                 </div>
              </div>
              
              <div className="flex gap-6">
                 <button onClick={()=>setLoForm({...loForm, isAbandoned: !loForm.isAbandoned})} className={`flex-1 p-6 brutalist-border font-black text-xl uppercase transition-all ${loForm.isAbandoned ? 'bg-rose-600 text-white' : 'bg-white text-black hover:bg-gray-100'}`}>ABANDONED</button>
                 <button onClick={()=>setLoForm({...loForm, isDls: !loForm.isDls})} className={`flex-1 p-6 brutalist-border font-black text-xl uppercase transition-all ${loForm.isDls ? 'bg-fuchsia-500 text-white' : 'bg-white text-black hover:bg-gray-100'}`}>DLS APPLIED</button>
              </div>
              
              <textarea placeholder="RECORD NOTES, MOM, OR MILESTONES..." className="w-full brutalist-border p-6 font-black mono text-sm uppercase h-32 focus:bg-yellow-50 outline-none bg-white text-black" value={loForm.notes} onChange={e=>setLoForm({...loForm, notes: e.target.value})} />
              
              <div className="flex gap-8 pt-8 border-t-8 border-black">
                 <BrutalistButton variant="success" className="flex-1 py-12 text-5xl shadow-[15px_15px_0px_black]" onClick={saveMatchResult}>FINALIZE SCORE</BrutalistButton>
                 <BrutalistButton variant="secondary" className="flex-1 py-12 text-5xl shadow-[15px_15px_0px_black]" onClick={()=>setConfirmingAction(null)}>DISCARD</BrutalistButton>
              </div>
            </div>
          </BrutalistCard>
        </div>
      )}

      {/* MODAL: RESET SYSTEM */}
      {confirmingAction?.type === 'REGENERATE_SCHEDULE' && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/98 p-6 animate-in fade-in duration-300">
           <BrutalistCard title="⚠️ CRITICAL ENGINE RESET" className="max-w-md w-full border-rose-600 bg-white shadow-[25px_25px_0px_#e11d48]">
              <div className="space-y-10 p-4 text-black">
                 <p className="font-black uppercase text-sm text-rose-600 italic leading-tight">You are initiating a hard reset. All matches, results, and NRR data will be purged. Verify tournament name to confirm:</p>
                 <div className="p-10 bg-rose-50 border-8 border-black font-black text-center text-4xl italic text-rose-600 uppercase transform -rotate-2">{tournament.name}</div>
                 <input className="w-full brutalist-border p-10 font-black uppercase text-center text-3xl outline-none focus:bg-rose-100 bg-white text-black" value={securityInput} onChange={e=>setSecurityInput(e.target.value)} placeholder="ENTER NAME" />
                 <div className="flex gap-4">
                    <BrutalistButton variant="danger" className="flex-1 py-10 text-3xl shadow-[8px_8px_0px_black]" onClick={handleRegenerateSchedule}>AUTH RESET</BrutalistButton>
                    <BrutalistButton variant="secondary" className="flex-1 py-10 text-3xl shadow-[8px_8px_0px_black]" onClick={()=>{setConfirmingAction(null); setSecurityInput('');}}>ABORT</BrutalistButton>
                 </div>
              </div>
           </BrutalistCard>
        </div>
      )}

      <footer className="fixed bottom-0 left-0 right-0 bg-black text-white p-10 border-t-8 border-black z-[100] flex justify-between items-center shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
        <div className="hidden md:flex flex-col">
          <span className="font-black uppercase italic text-yellow-400 text-5xl tracking-tighter leading-none">{tournament.name}</span>
          <span className="mono text-[10px] uppercase opacity-60 mt-2 tracking-[0.4em]">ENGINE v1.2.1 ACTIVE | NRR CALC v1.0</span>
        </div>
        <div className="flex gap-8">
          <BrutalistButton variant="danger" className="px-24 py-8 text-4xl" onClick={onExit}>EXIT HUB</BrutalistButton>
          <BrutalistButton variant="lime" className="px-24 py-8 text-4xl shadow-[10px_10px_0px_#84cc16]" onClick={handleExport}>SAVE CLOUD</BrutalistButton>
        </div>
      </footer>
    </div>
  );
};

export default TournamentWorkspace;
