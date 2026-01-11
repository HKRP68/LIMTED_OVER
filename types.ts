export type TournamentType = 'TEST' | 'LIMITED_OVERS';

export interface Team {
  id: string;
  name: string;
  logoUrl?: string;
  owner?: string;
  // Stats
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  matchesTie: number;
  runsScored: number;
  oversFaced: number;
  runsConceded: number;
  oversBowled: number;
  penalties: number;
  points: number;
  nrr?: number;
}

export interface Stadium {
  id: string;
  name: string;
}

export type MatchResultType = 'T1_WIN' | 'T2_WIN' | 'DRAW' | 'TIE' | 'NO_RESULT' | 'ABANDONED';

export interface Match {
  id: string;
  round: number;
  team1Id: string;
  team2Id: string;
  venueId: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  resultType?: MatchResultType;
  notes?: string;
  t1Runs?: number;
  t1Wickets?: number;
  t1Overs?: number;
  t2Runs?: number;
  t2Wickets?: number;
  t2Overs?: number;
  tossWinnerId?: string;
  isDlsApplied?: boolean;
}

export interface PenaltyRecord {
  id: string;
  teamId: string;
  points: number;
  reason: string;
  date: string;
}

export interface TournamentConfig {
  oversPerMatch: string;
  scheduleFormat: string;
  playoffSystem: string;
  pointsForWin: number;
  pointsForDraw: number;
  pointsForLoss: number;
  officials: string[];
  superOverAllowed: boolean;
  dlsEnabled: boolean;
}

export interface TournamentHeader {
  siteLogoUrl: string;
  tournamentName: string;
  tournamentLogoUrl: string;
  confirmed: boolean;
}

export type TournamentStatus = 'UPCOMING' | 'ONGOING' | 'COMPLETED';

export interface Tournament {
  id: string;
  name: string;
  type: TournamentType;
  createdDate: string;
  season?: string;
  status?: TournamentStatus;
  teams: Team[];
  stadiums: Stadium[];
  matches: Match[];
  penalties: PenaltyRecord[];
  config: TournamentConfig;
  header: TournamentHeader;
  teamsCount: number;
}

export type AppView = 'MAIN' | 'WORKSPACE';
export type MainTab = 'CREATE' | 'MANAGE';
export type WorkspaceTab = 'DASHBOARD' | 'INFO' | 'SCHEDULE' | 'RESULTS' | 'POINTS' | 'SETTINGS';