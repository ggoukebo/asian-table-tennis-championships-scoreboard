export type MatchStatus = "LIVE" | "OFFICIAL" | "SCHEDULED";
export type Side = "home" | "away";

export interface Athlete {
  id: string;
  name: string;
  cnName: string;
  org: string;
}

export interface Competitor {
  id: string;
  name: string;
  cnName: string;
  org: string;
  orgName: string;
  orgCn: string;
  score: number;
  winner: boolean;
  seed?: number;
  members: Athlete[];
}

export interface GamePeriod {
  gameNumber: number;
  homeScore: number;
  awayScore: number;
  finished: boolean;
  winner: Side | null;
}

export interface TeamRubber {
  number: number;
  homeName: string;
  homeCnName: string;
  awayName: string;
  awayCnName: string;
  homeScore: number;
  awayScore: number;
  periods: GamePeriod[];
  winner: Side | null;
  live: boolean;
}

export interface MatchSummary {
  id: string;
  key: string;
  eventKey: string;
  eventName: string;
  eventNameCn: string;
  roundName: string;
  roundNameCn: string;
  phaseKey: string;
  date: string;
  time: string;
  table: string;
  tableNumber: string;
  venue: string;
  status: MatchStatus;
  statusLabel: string;
  isTeam: boolean;
  bestOf: number;
  duration: string;
  home: Competitor;
  away: Competitor;
  periods: GamePeriod[];
  rubbers: TeamRubber[];
  currentPeriod: GamePeriod | null;
  currentRubber: TeamRubber | null;
  winnerSide: Side | null;
  sourceUrl: string;
}

export interface EventDate {
  raw: string;
  day: string;
  month: string;
  forCal: string;
}

export interface EventOption {
  Key: string;
  Desc: string;
}

export interface EventInfo {
  champ: string;
  champName: string;
  champNameCn: string;
  location: string;
  locationCn: string;
  datesDesc: string;
  dates: EventDate[];
  events: EventOption[];
  locations: EventOption[];
  isFinished: boolean;
  sourceUrl: string;
}

export interface MatchesResponse {
  matches: MatchSummary[];
  liveMatches: MatchSummary[];
  liveCount: number;
  fetchedAt: string;
  requestedDate: string;
}
