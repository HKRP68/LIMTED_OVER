import React, { useState, useMemo, useRef } from 'react';
import { Tournament, WorkspaceTab, Team, Match, MatchResultType } from '../types';
import BrutalistCard from './BrutalistCard';
import BrutalistButton from './BrutalistButton';
import { GoogleGenAI } from "@google/genai";
import html2canvas from 'html2canvas';

interface TournamentWorkspaceProps {
  tournament: Tournament;
  onExit: () => void;
  onUpdateTournament: (updated: Tournament) => void;
}

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

  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [confirmingAction, setConfirmingAction] = useState<{ type: string; matchId?: string; teamId?: string } | null>(null);
  const [loForm, setLoForm] = useState({
    t1Runs: 0, t1Wickets: 0, t1Overs: 0.0,
    t2Runs: 0, t2Wickets: 0, t2Overs: 0.0,
    notes: '', isDls: false, isAbandoned: false
  });

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

  const handleStandingsAnalysis = async (deepThink: boolean) => {
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Act as a world-class cricket analyst. Analyze the following standings and provide a brief, professional commentary. Standings: ${JSON.stringify(standings)}`;
      
      const response = await ai.models.generateContent({
        model: deepThink ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview',
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

  const handleGenerateSchedule = () => {
    const teams = tournament.teams;
    if (teams.length < 2) return alert("Need at least 2 teams!");

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
  };

  const standings = useMemo(() => {
    const data = tournament.teams.map(team => {
      const matches = tournament.matches.filter(m => (m.team1Id === team.id || m.team2Id === team.id) && m.status === 'COMPLETED');
      let mp = 0, mw = 0, ml = 0, mt = 0, nr = 0, pts = 0;
      let ts: number = 0, tf: number = 0, tc: number = 0, tb: number = 0;
      let form: string[] = [];

      matches.forEach(m => {
        mp++;
        const isT1 = m.team1Id === team.id;
        const res = m.resultType;
        const maxO = parseFloat(tournament.config.oversPerMatch) || 20;

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
          const rS = isT1 ? m.t1Runs : m.t2Runs;
          const wS = isT1 ? m.t1Wickets! : m.t2Wickets!;
          const oS = isT1 ? m.t1Overs! : m.t2Overs!;
          const rC = isT1 ? m.t2Runs : m.t1Runs;
          const wC = isT1 ? m.t2Wickets! : m.t1Wickets!;
          const oC = isT1 ? m.t2Overs! : m.t1Overs!;

          ts += rS;
          tc += rC;
          tf += (wS === 10) ? maxO : toTrueOvers(oS);
          tb += (wC === 10) ? maxO : toTrueOvers(oC);
        }
      });

      const penPts = tournament.penalties.filter(p => p.teamId === team.id).reduce((s, p) => s + (p.points || 0), 0);
      const nrr = (tf > 0 && tb > 0) ? (ts / tf) - (tc / tb) : 0;
      return { ...team, mp, mw, ml, mt, nr, pts: Math.max(0, pts - penPts), nrr, form: form.slice(-5).reverse() };
    });

    return data.sort((a, b) => b.pts - a.pts || b.nrr - a.nrr || a.name.localeCompare(b.name));
  }, [tournament]);

  const updateConfig = (key: keyof typeof tournament.config, value: any) => {
    onUpdateTournament({ ...tournament, config: { ...tournament.config, [key]: value } });
  };

  const updateTournamentDetail = (key: keyof Tournament, value: any) => {
    onUpdateTournament({ ...tournament, [key]: value });
  };

  const saveMatchResult = () => {
    const mId = confirmingAction?.matchId;
    if (!mId) return;
    const match = tournament.matches.find(m => m.id === mId)!;
    let res: MatchResultType = 'TIE';
    if (!loForm.isAbandoned) {
      if (loForm.t1Runs > loForm.t2Runs) res = 'T1_WIN';
      else if (loForm.t2Runs > loForm.t1Runs) res = 'T2_WIN';
    } else { res = 'ABANDONED'; }

    const updatedMatch: Match = {
      ...match, status: 'COMPLETED', resultType: res,
      t1Runs: loForm.t1Runs, t1Wickets: loForm.t1Wickets, t1Overs: loForm.t1Overs,
      t2Runs: loForm.t2Runs, t2Wickets: loForm.t2Wickets, t2Overs: loForm.t2Overs,
      notes: loForm.notes, isDlsApplied: loForm.isDls
    };

    onUpdateTournament({ ...tournament, matches: tournament.matches.map(m => m.id === mId ? updatedMatch : m) });
    setConfirmingAction(null);
  };

  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <BrutalistCard className="bg-white text-center"><span className="text-4xl font-black">{tournament.matches.length}</span><div className="text-xs uppercase font-bold opacity-50">Total</div></BrutalistCard>
        <BrutalistCard className="bg-emerald-400 text-center"><span className="text-4xl font-black">{tournament.matches.filter(m=>m.status==='COMPLETED').length}</span><div className="text-xs uppercase font-bold opacity-50 text-black">Done</div></BrutalistCard>
        <BrutalistCard className="bg-white text-center"><span className="text-4xl font-black">{tournament.teams.length}</span><div className="text-xs uppercase font-bold opacity-50">Teams</div></BrutalistCard>
        <BrutalistCard className="bg-white text-center"><span className="text-4xl font-black">{tournament.matches.filter(m=>m.status==='NOT_STARTED').length}</span><div className="text-xs uppercase font-bold opacity-50">Left</div></BrutalistCard>
      </div>
      {tournament.matches.length === 0 && (
        <BrutalistButton variant="primary" className="w-full py-10 text-3xl" onClick={handleGenerateSchedule}>INITIALIZE SCHEDULE</BrutalistButton>
      )}
    </div>
  );

  return (
    <div className="space-y-10 pb-40">
      <nav className="flex flex-wrap gap-4 sticky top-[100px] z-40 bg-gray-200/95 p-4 border-b-4 border-black -mx-4">
        {['DASHBOARD', 'SCHEDULE', 'POINTS', 'INFO', 'SETTINGS'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab as WorkspaceTab)} className={`px-6 py-2 font-black uppercase text-xs brutalist-border ${activeTab === tab ? 'bg-black text-white shadow-none' : 'bg-white hover:bg-yellow-400'}`}>{tab}</button>
        ))}
      </nav>

      <main>
        {activeTab === 'DASHBOARD' && renderDashboard()}
        {activeTab === 'SCHEDULE' && (
          <div className="space-y-6">
            <BrutalistCard title="SCHEDULE" variant="white">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-black text-white text-[10px] uppercase">
                    <tr><th className="p-3">MATCHUP</th><th className="p-3 text-center">STATUS</th><th className="p-3 text-center">ACTION</th></tr>
                  </thead>
                  <tbody>
                    {tournament.matches.map(m => (
                      <tr key={m.id} className="border-b border-black/10 text-black font-bold uppercase text-sm">
                        <td className="p-3">{tournament.teams.find(t=>t.id===m.team1Id)?.name} VS {tournament.teams.find(t=>t.id===m.team2Id)?.name}</td>
                        <td className="p-3 text-center"><span className="px-2 py-1 bg-gray-200 text-[8px] border border-black">{m.status}</span></td>
                        <td className="p-3 text-center">
                          <BrutalistButton compact variant="magenta" onClick={() => {
                            setConfirmingAction({type:'SAVE_RESULT', matchId: m.id});
                            setLoForm({
                              t1Runs: m.t1Runs || 0, t1Wickets: m.t1Wickets || 0, t1Overs: m.t1Overs || 0,
                              t2Runs: m.t2Runs || 0, t2Wickets: m.t2Wickets || 0, t2Overs: m.t2Overs || 0,
                              notes: m.notes || '', isDls: m.isDlsApplied || false, isAbandoned: m.resultType === 'ABANDONED'
                            });
                          }}>SCORE</BrutalistButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </BrutalistCard>
          </div>
        )}
        {activeTab === 'POINTS' && (
          <div className="space-y-8">
            <div ref={pointsTableRef} className="bg-white p-6 brutalist-border shadow-[10px_10px_0px_black] text-black">
              <h2 className="text-3xl font-black uppercase italic mb-6">OFFICIAL STANDINGS</h2>
              <table className="w-full text-left font-black border-collapse">
                <thead className="bg-black text-white text-[10px]">
                  <tr><th className="p-3">#</th><th className="p-3">TEAM</th><th className="p-3">MP</th><th className="p-3">W</th><th className="p-3">L</th><th className="p-3">NRR</th><th className="p-3 bg-gray-800">PTS</th></tr>
                </thead>
                <tbody className="divide-y-2 divide-black text-lg">
                  {standings.map((t, i) => (
                    <tr key={t.id} className={i < 4 ? 'bg-emerald-50' : ''}>
                      <td className="p-3 border-r border-black/10">{i+1}</td>
                      <td className="p-3 uppercase italic border-r border-black/10">{t.name}</td>
                      <td className="p-3 border-r border-black/10">{t.mp}</td>
                      <td className="p-3 border-r border-black/10 text-emerald-600">{t.mw}</td>
                      <td className="p-3 border-r border-black/10 text-rose-600">{t.ml}</td>
                      <td className="p-3 border-r border-black/10">{(t.nrr || 0).toFixed(3)}</td>
                      <td className="p-3 bg-gray-100 text-3xl font-black border-l-2 border-black">{t.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-6 pt-4 border-t-2 border-dashed border-black mono text-[8px] uppercase opacity-50">
                Tie-break: Points {' > '} NRR {' > '} Head-to-Head | Generated {new Date().toLocaleDateString()}
              </div>
            </div>
            <BrutalistButton variant="info" className="w-full py-4" onClick={() => handleStandingsAnalysis(false)} disabled={isAnalyzing}>
              {isAnalyzing ? 'Analyzing...' : 'GET AI ANALYSIS'}
            </BrutalistButton>
            {aiAnalysis && <div className="p-4 bg-black text-white mono text-xs uppercase brutalist-border">{aiAnalysis}</div>}
          </div>
        )}
      </main>

      {confirmingAction?.type === 'SAVE_RESULT' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
          <BrutalistCard title="SCORE ENTRY" className="max-w-xl w-full text-black">
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase">Runs</label>
                  <input type="number" className="w-full brutalist-border p-2 font-black text-2xl" value={loForm.t1Runs} onChange={e=>setLoForm({...loForm, t1Runs: parseInt(e.target.value)||0})} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase">Runs (T2)</label>
                  <input type="number" className="w-full brutalist-border p-2 font-black text-2xl" value={loForm.t2Runs} onChange={e=>setLoForm({...loForm, t2Runs: parseInt(e.target.value)||0})} />
                </div>
              </div>
              <div className="flex gap-4">
                <BrutalistButton variant="success" className="flex-1 py-4" onClick={saveMatchResult}>SAVE</BrutalistButton>
                <BrutalistButton variant="secondary" className="flex-1 py-4" onClick={()=>setConfirmingAction(null)}>CANCEL</BrutalistButton>
              </div>
            </div>
          </BrutalistCard>
        </div>
      )}

      <footer className="fixed bottom-0 left-0 right-0 bg-black text-white p-6 border-t-4 border-black z-50 flex justify-between items-center">
        <span className="font-black italic uppercase text-yellow-400 text-2xl">{tournament.name}</span>
        <BrutalistButton variant="danger" compact onClick={onExit}>EXIT</BrutalistButton>
      </footer>
    </div>
  );
};

export default TournamentWorkspace;
