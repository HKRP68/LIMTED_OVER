import React, { useState, useEffect } from 'react';
import { Tournament, TournamentType, Team, Stadium, TournamentConfig, TournamentHeader } from '../types';
import BrutalistCard from './BrutalistCard';
import BrutalistButton from './BrutalistButton';

const AI_TEAM_NAMES = ["Thunder Gods", "Shadow Strikers", "Neon Knights", "Cyber Challengers", "Void Vipers", "Pixel Pirates", "Binary Batters", "Glitch Guardians"];
const AI_STADIUMS = ["The Grid Arena", "Discord Dome", "Vertex Oval", "Fragment Field", "Matrix Stadium"];

interface CreateTournamentFormProps {
  onCreate: (tournament: Tournament) => void;
}

const CreateTournamentForm: React.FC<CreateTournamentFormProps> = ({ onCreate }) => {
  // Panel 1: Basic Info
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  // Panel 2: Type (FORCED TO LIMITED OVERS FOR THIS MANAGER)
  const type: TournamentType = 'LIMITED_OVERS';

  // Panel 3: Format Config
  const [overs, setOvers] = useState('20');
  const [customOvers, setCustomOvers] = useState('');

  // Panel 4: Teams
  const [numTeams, setNumTeams] = useState(8);
  const [teams, setTeams] = useState<Team[]>([]);

  // Panel 5: Stadiums
  const [stadiums, setStadiums] = useState<Stadium[]>([]);
  const [currentStadium, setCurrentStadium] = useState('');

  // Panel 6: Structure
  const [scheduleFormat, setScheduleFormat] = useState('SINGLE ROUND ROBIN (SRR)');
  const [playoffSystem, setPlayoffSystem] = useState('SEMI-FINAL SYSTEM (TOP 4)');

  // Panel 7: Header Preview
  const [headerConfig, setHeaderConfig] = useState<TournamentHeader>({
    siteLogoUrl: '',
    tournamentName: '',
    tournamentLogoUrl: '',
    confirmed: false
  });

  // Panel 8: Points Formula (LO Standard)
  const [winPts, setWinPts] = useState(2);
  const [drawPts, setDrawPts] = useState(1);
  const [lossPts, setLossPts] = useState(0);

  // Panel 9: Officials
  const [officials, setOfficials] = useState('');

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

  // Auto-generate team slots when numTeams changes
  useEffect(() => {
    const newTeams: Team[] = Array.from({ length: numTeams }, (_, i) => ({
      id: `team-${i}`,
      name: teams[i]?.name || '',
      logoUrl: teams[i]?.logoUrl || '',
      owner: teams[i]?.owner || '',
      matchesPlayed: 0,
      matchesWon: 0,
      matchesLost: 0,
      matchesTie: 0,
      runsScored: 0,
      oversFaced: 0,
      runsConceded: 0,
      oversBowled: 0,
      penalties: 0,
      points: 0,
    }));
    setTeams(newTeams);
  }, [numTeams]);

  const fillAiTeams = () => {
    setTeams(teams.map((t, i) => ({
      ...t,
      name: AI_TEAM_NAMES[i % AI_TEAM_NAMES.length] + " " + (Math.floor(i / AI_TEAM_NAMES.length) + 1)
    })));
  };

  const fillAiStadiums = () => {
    setStadiums(AI_STADIUMS.map(s => ({ id: Math.random().toString(), name: s })));
  };

  const addStadium = () => {
    if (currentStadium.trim()) {
      setStadiums([...stadiums, { id: Date.now().toString(), name: currentStadium }]);
      setCurrentStadium('');
    }
  };

  const removeStadium = (id: string, sName: string) => {
    if (confirm(`Are you sure you want to remove "${sName}"?`)) {
      setStadiums(stadiums.filter(st => st.id !== id));
    }
  };

  const handleSubmit = () => {
    if (!name.trim()) return alert("Panel 1: Tournament Name Required!");
    if (teams.some(t => !t.name.trim())) return alert("Panel 4: All Team Names Required!");

    const finalTournament: Tournament = {
      id: Date.now().toString(),
      name,
      type,
      createdDate: new Date().toLocaleDateString(),
      teams,
      stadiums,
      matches: [],
      penalties: [],
      teamsCount: teams.length,
      header: headerConfig,
      config: {
        oversPerMatch: overs === 'Custom' ? customOvers : overs,
        scheduleFormat,
        playoffSystem,
        pointsForWin: winPts,
        pointsForDraw: drawPts,
        pointsForLoss: lossPts,
        officials: officials.split(',').map(s => s.trim()),
        superOverAllowed: true,
        dlsEnabled: true
      }
    };
    onCreate(finalTournament);
  };

  const calcMatches = () => {
    const N = numTeams;
    if (scheduleFormat.includes('SINGLE ROUND ROBIN')) return (N * (N - 1)) / 2;
    if (scheduleFormat.includes('DOUBLE ROUND ROBIN')) return N * (N - 1);
    if (scheduleFormat.includes('KNOCKOUT')) return N - 1;
    return 'CALCULATING...';
  };

  return (
    <div className="space-y-12 pb-32 max-w-5xl mx-auto relative text-black">
      
      {/* PANEL 1 */}
      <BrutalistCard title="PANEL 1: TOURNAMENT BASIC INFORMATION" variant="yellow">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block font-black text-xl mb-2 text-black">TOURNAMENT NAME *</label>
              <input 
                className="w-full brutalist-border p-4 text-2xl font-black uppercase bg-white text-black focus:bg-yellow-100 outline-none" 
                value={name} onChange={e => setName(e.target.value)} placeholder="E.G. DISCORD ASHES"
              />
            </div>
            <div>
              <label className="block font-black text-sm mb-2 text-black">UPLOAD TOURNAMENT LOGO</label>
              <input 
                type="file"
                accept="image/*"
                className="w-full brutalist-border p-3 font-bold bg-white text-black outline-none cursor-pointer" 
                onChange={e => handleLogoUpload(e, setLogoUrl)}
              />
            </div>
          </div>
          <div className="brutalist-border bg-white flex items-center justify-center p-4 min-h-[150px] shadow-[10px_10px_0px_black]">
            {logoUrl ? <img src={logoUrl} alt="Logo Preview" className="max-h-32 object-contain" /> : <span className="font-black text-gray-300">LOGO PREVIEW</span>}
          </div>
        </div>
      </BrutalistCard>

      {/* PANEL 2: FORCED LO */}
      <BrutalistCard title="PANEL 2: TOURNAMENT TYPE" variant="cyan">
        <div className="p-8 brutalist-border bg-black text-white text-3xl font-black uppercase text-center shadow-[10px_10px_0px_#22d3ee]">
          LIMITED OVERS MODE ACTIVE
          <div className="text-[10px] font-bold text-yellow-400 mt-2 tracking-[0.5em]">Test mode disabled for this workspace</div>
        </div>
      </BrutalistCard>

      {/* PANEL 3 */}
      <BrutalistCard title="PANEL 3: OVERS CONFIGURATION" variant="magenta">
        <div className="space-y-4">
          <label className="block font-black text-xl mb-2 text-black">OVERS PER MATCH</label>
          <select className="w-full brutalist-border p-4 font-black text-xl uppercase bg-white text-black shadow-[6px_6px_0px_black]" value={overs} onChange={e => setOvers(e.target.value)}>
            <option value="5">5 OVERS</option>
            <option value="10">10 OVERS</option>
            <option value="15">15 OVERS</option>
            <option value="20">20 OVERS</option>
            <option value="Custom">CUSTOM OVERS</option>
          </select>
          {overs === 'Custom' && (
            <input className="w-full brutalist-border p-4 font-black uppercase bg-white text-black mt-2 shadow-[6px_6px_0px_black]" placeholder="WRITE OVERS" value={customOvers} onChange={e => setCustomOvers(e.target.value)} />
          )}
        </div>
      </BrutalistCard>

      {/* PANEL 4 */}
      <BrutalistCard title="PANEL 4: TEAMS CONFIGURATION" variant="lime">
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row items-center gap-4 justify-between">
            <div className="flex items-center gap-4">
              <label className="font-black text-xl text-black">NUM OF TEAMS:</label>
              <input 
                type="number" min="2" max="32" value={numTeams} 
                onChange={e => setNumTeams(Number(e.target.value))}
                className="brutalist-border p-2 w-24 text-center font-black text-xl bg-white text-black"
              />
            </div>
            <BrutalistButton variant="secondary" onClick={fillAiTeams}>FILL AI TEAM NAMES</BrutalistButton>
          </div>
          
          <div className="brutalist-border bg-white overflow-x-auto shadow-[8px_8px_0px_black]">
            <table className="w-full text-left">
              <thead className="bg-black text-white">
                <tr>
                  <th className="p-3 border-r border-white">#</th>
                  <th className="p-3 border-r border-white">TEAM NAME</th>
                  <th className="p-3 border-r border-white">UPLOAD LOGO</th>
                  <th className="p-3">OWNER</th>
                </tr>
              </thead>
              <tbody className="bg-white text-black">
                {teams.map((t, i) => (
                  <tr key={t.id} className="border-b-2 border-black group">
                    <td className="p-3 font-black mono text-center bg-gray-100 group-hover:bg-yellow-400 text-black">{i+1}</td>
                    <td className="p-2 border-r border-black bg-white">
                      <input 
                        className="w-full p-2 uppercase font-bold outline-none bg-white text-black focus:bg-yellow-50" 
                        value={t.name} onChange={e => {
                          const nt = [...teams];
                          nt[i].name = e.target.value;
                          setTeams(nt);
                        }}
                      />
                    </td>
                    <td className="p-2 border-r border-black bg-white">
                      <div className="flex items-center gap-2">
                        {t.logoUrl && <img src={t.logoUrl} className="w-8 h-8 brutalist-border p-0.5 object-contain" alt="preview" />}
                        <input 
                          type="file"
                          accept="image/*"
                          className="w-full p-1 mono text-[10px] bg-white text-black outline-none cursor-pointer" 
                          onChange={e => handleLogoUpload(e, (base64) => {
                            const nt = [...teams];
                            nt[i].logoUrl = base64;
                            setTeams(nt);
                          })}
                        />
                      </div>
                    </td>
                    <td className="p-2 bg-white">
                      <input 
                        className="w-full p-2 uppercase font-bold outline-none bg-white text-black focus:bg-yellow-50" 
                        value={t.owner} onChange={e => {
                          const nt = [...teams];
                          nt[i].owner = e.target.value;
                          setTeams(nt);
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </BrutalistCard>

      {/* PANEL 5 */}
      <BrutalistCard title="PANEL 5: STADIUM / VENUE SETUP" className="bg-orange-100">
        <div className="space-y-4">
          <div className="flex gap-2">
            <input 
              className="flex-grow brutalist-border p-4 font-black uppercase bg-white text-black outline-none shadow-[4px_4px_0px_black]" 
              placeholder="ADD STADIUM NAME" value={currentStadium} onChange={e => setCurrentStadium(e.target.value)}
            />
            <BrutalistButton variant="success" onClick={addStadium}>ADD</BrutalistButton>
            <BrutalistButton variant="primary" onClick={fillAiStadiums}>AI STADIUMS</BrutalistButton>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stadiums.map((s, i) => (
              <div key={s.id} className="brutalist-border p-3 bg-white text-black flex justify-between items-center group hover:bg-rose-50 transition-colors shadow-[4px_4px_0px_black]">
                <span className="font-black uppercase tracking-tighter">{i+1}. {s.name}</span>
                <button onClick={() => removeStadium(s.id, s.name)} className="text-rose-600 font-black opacity-0 group-hover:opacity-100 text-xs hover:underline">REMOVE</button>
              </div>
            ))}
          </div>
        </div>
      </BrutalistCard>

      {/* PANEL 6 */}
      <BrutalistCard title="PANEL 6: STRUCTURE & PLAYOFFS" className="bg-purple-100">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <label className="block font-black text-xl text-black">SCHEDULE FORMAT</label>
            <select className="w-full brutalist-border p-4 font-black uppercase bg-white text-black shadow-[6px_6px_0px_black]" value={scheduleFormat} onChange={e => setScheduleFormat(e.target.value)}>
              <option>SINGLE ROUND ROBIN (SRR)</option>
              <option>DOUBLE ROUND ROBIN (DRR)</option>
              <option>ROUND ROBIN + PLAYOFFS (TOP 4)</option>
              <option>KNOCKOUT (SINGLE ELIMINATION)</option>
            </select>
            <div className="bg-black text-white p-4 brutalist-border shadow-[6px_6px_0px_#a855f7]">
              <p className="mono text-xs mb-1">CALCULATED MATCHES:</p>
              <p className="text-3xl font-black uppercase">{calcMatches()}</p>
            </div>
          </div>
          <div className="space-y-4">
            <label className="block font-black text-xl text-black">PLAYOFF SYSTEM</label>
            <select className="w-full brutalist-border p-4 font-black uppercase bg-white text-black shadow-[6px_6px_0px_black]" value={playoffSystem} onChange={e => setPlayoffSystem(e.target.value)}>
              <option>FINAL ONLY (TOP 2)</option>
              <option>SEMI-FINAL SYSTEM (TOP 4)</option>
              <option>PAGE PLAYOFF SYSTEM (IPL STYLE)</option>
            </select>
          </div>
        </div>
      </BrutalistCard>

      {/* PANEL 8: POINTS FORMULA */}
      <BrutalistCard title="PANEL 8: POINTS FORMULA" variant="blue">
        <div className="grid grid-cols-3 gap-6 bg-white p-6 brutalist-border shadow-[10px_10px_0px_black]">
          <div className="space-y-2">
            <label className="block font-black uppercase text-xs text-center text-black">WIN</label>
            <input type="number" className="w-full brutalist-border p-6 font-black text-4xl text-center shadow-[6px_6px_0px_black] bg-white text-black" value={winPts} onChange={e => setWinPts(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <label className="block font-black uppercase text-xs text-center text-black">TIE / NR</label>
            <input type="number" className="w-full brutalist-border p-6 font-black text-4xl text-center shadow-[6px_6px_0px_black] bg-white text-black" value={drawPts} onChange={e => setDrawPts(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <label className="block font-black uppercase text-xs text-center text-black">LOSS</label>
            <input type="number" className="w-full brutalist-border p-6 font-black text-4xl text-center shadow-[6px_6px_0px_black] bg-white text-black" value={lossPts} onChange={e => setLossPts(Number(e.target.value))} />
          </div>
        </div>
      </BrutalistCard>

      {/* PANEL 9 */}
      <BrutalistCard title="PANEL 9: OFFICIALS / ADMINS" className="bg-teal-100">
        <div className="space-y-4">
          <p className="mono text-xs font-bold uppercase text-black">Authorized operators (comma separated)</p>
          <textarea 
            className="w-full brutalist-border p-4 h-24 font-bold mono bg-white text-black outline-none focus:bg-white shadow-[6px_6px_0px_black]" 
            placeholder="USER#0001, ADMIN_ROOT..."
            value={officials}
            onChange={e => setOfficials(e.target.value)}
          />
        </div>
      </BrutalistCard>

      {/* STICKY FOOTER */}
      <div className="sticky bottom-0 left-0 right-0 z-50 bg-gray-200/90 backdrop-blur-md -mx-4 md:-mx-10 px-4 md:px-10 py-6 border-t-8 border-black shadow-[0_-10px_20px_rgba(0,0,0,0.1)]">
        <button 
          onClick={handleSubmit}
          className="w-full brutalist-border bg-black text-white p-6 md:p-10 text-3xl md:text-5xl font-black uppercase tracking-tighter hover:bg-yellow-400 hover:text-black transition-all brutalist-shadow active:translate-y-2 active:shadow-none"
        >
          GENERATE TOURNAMENT
        </button>
      </div>

    </div>
  );
};

export default CreateTournamentForm;