import https from "node:https";
import type {
  Athlete,
  Competitor,
  EventInfo,
  GamePeriod,
  MatchStatus,
  MatchSummary,
  Side,
  TeamRubber
} from "../shared/types.ts";
import {
  getCountryCn,
  getEventKey,
  getEventNameCn,
  getEventNameEn,
  getLocationCn,
  getPlayerCn,
  getRoundNameCn,
  getStatusLabel
} from "./chineseNames.ts";

const RESULTS_ROOT = "https://results.ittf.com/ittf-web-results/";
const EVENT_ID = "TTE3474";
const EVENT_BASE = `${RESULTS_ROOT}html/${EVENT_ID}/`;
const SOURCE_URL = `${RESULTS_ROOT}html/${EVENT_ID}/results.html`;
const DAY_CACHE_MS = 8_000;
const EVENT_CACHE_MS = 5 * 60_000;
const LIVE_CACHE_MS = 2_000;

interface RawMatch {
  Key: string;
  Desc: string;
  Time: string;
  Loc: string;
  LocDesc?: string;
  Venue?: string;
  RTime?: string;
  Status: number;
  IsTeam: boolean;
  Duration?: string;
  Home: RawSide;
  Away: RawSide;
  SubMatches?: Array<{
    Home: RawSide;
    Away: RawSide;
    Duration?: string;
  }>;
}

interface RawSide {
  Reg?: string;
  Org?: string;
  OrgDesc?: string;
  Desc?: string;
  Res?: string | number;
  TeamResult?: string | number | null;
  TeamReg?: string;
  TeamOrg?: string;
  Win?: boolean;
  RkPo?: number;
  Members?: Array<{
    Reg?: string;
    Org?: string;
    Desc?: string;
  }>;
  Splits?: Array<{
    Win?: boolean;
    Res?: string | number;
  }>;
}

interface RawEventInfo {
  champ: string;
  champDesc: string;
  location: string;
  datesDesc: string;
  dates: EventInfo["dates"];
  events: EventInfo["events"];
  locations: EventInfo["locations"];
  isFinished: boolean;
}

interface CacheEntry<T> {
  time: number;
  data: T;
}

function httpsGet(url: string, redirects = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    if (redirects > 4) {
      reject(new Error("Too many redirects"));
      return;
    }

    const req = https.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          Referer: SOURCE_URL
        },
        timeout: 20_000
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const nextUrl = new URL(res.headers.location, url).toString();
          res.resume();
          httpsGet(nextUrl, redirects + 1).then(resolve).catch(reject);
          return;
        }

        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          reject(new Error(`ITTF request failed with HTTP ${res.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      }
    );

    req.on("timeout", () => req.destroy(new Error("ITTF request timed out")));
    req.on("error", reject);
  });
}

async function getJson<T>(url: string): Promise<T> {
  const raw = await httpsGet(url);
  return JSON.parse(raw.replace(/^\uFEFF/, "")) as T;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getSideWinner(scoreHome: number, scoreAway: number, rawWin?: boolean): Side | null {
  if (scoreHome > scoreAway) return "home";
  if (scoreAway > scoreHome) return "away";
  if (rawWin) return "home";
  return null;
}

function parsePeriods(home?: RawSide, away?: RawSide): GamePeriod[] {
  const homeSplits = home?.Splits || [];
  const awaySplits = away?.Splits || [];
  const length = Math.max(homeSplits.length, awaySplits.length);
  const periods: GamePeriod[] = [];

  for (let index = 0; index < length; index += 1) {
    const homeRaw = homeSplits[index];
    const awayRaw = awaySplits[index];
    const homeHasScore = homeRaw?.Res !== undefined && String(homeRaw.Res).trim() !== "";
    const awayHasScore = awayRaw?.Res !== undefined && String(awayRaw.Res).trim() !== "";
    if (!homeHasScore && !awayHasScore) continue;

    const homeScore = toNumber(homeRaw?.Res);
    const awayScore = toNumber(awayRaw?.Res);
    const reachedGamePoint =
      Math.max(homeScore, awayScore) >= 11 && Math.abs(homeScore - awayScore) >= 2;
    const decided = Boolean(homeRaw?.Win || awayRaw?.Win) || reachedGamePoint;
    let winner: Side | null = null;
    if (decided) {
      if (homeRaw?.Win && !awayRaw?.Win) winner = "home";
      else if (awayRaw?.Win && !homeRaw?.Win) winner = "away";
      else if (homeScore !== awayScore) winner = homeScore > awayScore ? "home" : "away";
    }

    periods.push({
      gameNumber: periods.length + 1,
      homeScore,
      awayScore,
      finished: Boolean(winner),
      winner
    });
  }

  return periods;
}

function getLivePeriod(periods: GamePeriod[]): GamePeriod | null {
  return (
    [...periods].reverse().find((period) => !period.finished) ||
    periods[periods.length - 1] ||
    null
  );
}

function parseMembers(side: RawSide, fallbackName: string, org: string): Athlete[] {
  if (Array.isArray(side.Members) && side.Members.length > 0) {
    return side.Members.filter((member) => member?.Desc).map((member, index) => {
      const name = String(member.Desc || "").trim();
      return {
        id: String(member.Reg || `${side.Reg || "player"}-${index}`),
        name,
        cnName: getPlayerCn(name),
        org: String(member.Org || org || "")
      };
    });
  }

  if (!fallbackName) return [];
  return [
    {
      id: String(side.Reg || ""),
      name: fallbackName,
      cnName: getPlayerCn(fallbackName),
      org
    }
  ];
}

function parseCompetitor(side: RawSide | undefined, useOrgName = false): Competitor {
  const org = String(side?.Org || "").trim().toUpperCase();
  const rawName = String(side?.Desc || "").trim();
  const name = useOrgName
    ? String(side?.OrgDesc || rawName).trim()
    : rawName;
  const score = toNumber(side?.Res);
  return {
    id: String(side?.Reg || ""),
    name: name || "待定",
    cnName: getPlayerCn(name) || "待定",
    org,
    orgName: String(side?.OrgDesc || org || "待定"),
    orgCn: getCountryCn(org) || "待定",
    score,
    winner: Boolean(side?.Win) || false,
    seed: side?.RkPo || undefined,
    members: parseMembers(side || {}, name, org)
  };
}

function parseRubbers(matches: RawMatch["SubMatches"]): TeamRubber[] {
  if (!Array.isArray(matches)) return [];

  return matches
    .filter((rubber) => {
      if (!rubber?.Home && !rubber?.Away) return false;
      const hasPlayer =
        String(rubber.Home?.Desc || "").trim() !== "" ||
        String(rubber.Away?.Desc || "").trim() !== "";
      const hasScore =
        toNumber(rubber.Home?.Res) !== 0 ||
        toNumber(rubber.Away?.Res) !== 0;
      const hasSplit = [...(rubber.Home?.Splits || []), ...(rubber.Away?.Splits || [])].some(
        (split) => toNumber(split?.Res) !== 0
      );
      return hasPlayer || hasScore || hasSplit;
    })
    .map((rubber, index) => {
      const homeName = String(rubber.Home?.Desc || "待定");
      const awayName = String(rubber.Away?.Desc || "待定");
      const periods = parsePeriods(rubber.Home, rubber.Away);
      const { homeScore, awayScore } = resolveRubberScore(
        toNumber(rubber.Home?.Res),
        toNumber(rubber.Away?.Res),
        periods
      );
      const winner =
        Math.max(homeScore, awayScore) >= 3 && homeScore !== awayScore
          ? homeScore > awayScore
            ? "home"
            : "away"
          : null;
      return {
        number: index + 1,
        homeName,
        homeCnName: getPlayerCn(homeName),
        awayName,
        awayCnName: getPlayerCn(awayName),
        homeScore,
        awayScore,
        periods,
        winner,
        live: !winner && periods.length > 0
      };
    });
}

function pickCurrentRubber(
  rubbers: TeamRubber[],
  home?: RawSide,
  away?: RawSide
): TeamRubber | null {
  const homeName = String(home?.Desc || "").trim();
  const awayName = String(away?.Desc || "").trim();
  const matchesCurrentPlayers = (rubber: TeamRubber) =>
    Boolean(homeName && awayName) &&
    rubber.homeName === homeName &&
    rubber.awayName === awayName;

  return (
    rubbers.find((rubber) => rubber.live && matchesCurrentPlayers(rubber)) ||
    rubbers.find((rubber) => rubber.live) ||
    rubbers.find((rubber) => !rubber.winner && matchesCurrentPlayers(rubber)) ||
    rubbers.find((rubber) => !rubber.winner && rubber.periods.length > 0) ||
    rubbers.find((rubber) => !rubber.winner) ||
    null
  );
}

function enrichTeamMembers(competitor: Competitor, rubbers: TeamRubber[], side: Side): Competitor {
  if (!competitor.org || rubbers.length === 0) return competitor;
  const seen = new Set<string>();
  const members: Athlete[] = [];

  for (const rubber of rubbers) {
    const name = side === "home" ? rubber.homeName : rubber.awayName;
    const cnName = side === "home" ? rubber.homeCnName : rubber.awayCnName;
    if (!name || name === "待定" || seen.has(name)) continue;
    seen.add(name);
    members.push({
      id: `${competitor.org}-${members.length + 1}`,
      name,
      cnName,
      org: competitor.org
    });
  }

  return { ...competitor, members };
}

function parseStatus(status: number): MatchStatus {
  if (status === 2) return "LIVE";
  if (status === 1) return "OFFICIAL";
  return "SCHEDULED";
}

function hasPeriodScore(period: GamePeriod): boolean {
  return period.finished || period.homeScore > 0 || period.awayScore > 0;
}

function hasRubberStarted(rubber: TeamRubber): boolean {
  return rubber.homeScore > 0 || rubber.awayScore > 0 || rubber.periods.some(hasPeriodScore);
}

export function resolveRubberScore(
  rawHomeScore: number,
  rawAwayScore: number,
  periods: GamePeriod[]
): { homeScore: number; awayScore: number } {
  const homeFromPeriods = periods.filter((period) => period.winner === "home").length;
  const awayFromPeriods = periods.filter((period) => period.winner === "away").length;

  // Rubber result fields can lag one game behind the live split scores.
  return {
    homeScore: Math.max(rawHomeScore, homeFromPeriods),
    awayScore: Math.max(rawAwayScore, awayFromPeriods)
  };
}

export function inferMatchStatus(
  rawStatus: number,
  isTeam: boolean,
  periods: GamePeriod[],
  rubbers: TeamRubber[],
  homeScore: number,
  awayScore: number,
  rawWinner: boolean
): MatchStatus {
  const parsedStatus = parseStatus(rawStatus);
  const hasStarted = isTeam
    ? rubbers.some(hasRubberStarted)
    : periods.some(hasPeriodScore);
  const decided = rawWinner || homeScore >= 3 || awayScore >= 3;

  // ITTF sometimes leaves an in-progress match at Status=4 while already
  // publishing completed games or rubbers. Scores are the reliable signal.
  if (parsedStatus === "SCHEDULED" && hasStarted) return decided ? "OFFICIAL" : "LIVE";
  if (parsedStatus !== "OFFICIAL" && decided) return "OFFICIAL";
  return parsedStatus;
}

function formatTime(raw: RawMatch): string {
  const direct = String(raw.RTime || "").trim();
  if (direct) return direct;
  const match = String(raw.Time || "").match(/(\d{1,2}:\d{2})\s*$/);
  return match?.[1] || String(raw.Time || "");
}

function formatTable(raw: RawMatch): string {
  const code = String(raw.Loc || "").trim();
  const number = code.match(/(\d+)/)?.[1];
  if (number) return `球台 ${Number(number)}`;
  if (raw.LocDesc) return raw.LocDesc;
  return "球台待定";
}

function hasRawValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function mergeRawSide(base: RawSide | undefined, live: RawSide | undefined, isTeam: boolean): RawSide {
  if (!base) return live || {};
  if (!live) return base;

  if (isTeam) {
    return {
      ...base,
      TeamResult: hasRawValue(live.TeamResult) ? live.TeamResult : base.TeamResult,
      Win: live.Win ?? base.Win
    };
  }

  return {
    ...base,
    Res: hasRawValue(live.Res) ? live.Res : base.Res,
    Win: live.Win ?? base.Win,
    Splits: Array.isArray(live.Splits) && live.Splits.length > 0 ? live.Splits : base.Splits
  };
}

function mergeRawMatch(dayMatch: RawMatch | undefined, liveMatch: RawMatch): RawMatch {
  if (!dayMatch) return liveMatch;

  const officialMatch =
    dayMatch.Status === 1 ? dayMatch : liveMatch.Status === 1 ? liveMatch : null;

  return {
    ...dayMatch,
    Time: liveMatch.Time || dayMatch.Time,
    RTime: liveMatch.RTime || dayMatch.RTime,
    Loc: liveMatch.Loc || dayMatch.Loc,
    LocDesc: liveMatch.LocDesc || dayMatch.LocDesc,
    Venue: liveMatch.Venue || dayMatch.Venue,
    Status: officialMatch ? 1 : liveMatch.Status,
    Duration: liveMatch.Duration || dayMatch.Duration,
    Home:
      officialMatch?.Home ??
      mergeRawSide(dayMatch.Home, liveMatch.Home, Boolean(dayMatch.IsTeam)),
    Away:
      officialMatch?.Away ??
      mergeRawSide(dayMatch.Away, liveMatch.Away, Boolean(dayMatch.IsTeam)),
    SubMatches:
      officialMatch?.SubMatches ??
      (Array.isArray(liveMatch.SubMatches) && liveMatch.SubMatches.length > 0
        ? liveMatch.SubMatches
        : dayMatch.SubMatches)
  };
}

function inferDate(raw: RawMatch, dates: EventInfo["dates"]): string {
  const timeText = String(raw.Time || "");
  const day = timeText.match(/\b(\d{1,2})\b/)?.[1];
  if (!day) return "";
  const matched = dates.find((date) => date.day === day);
  return matched?.raw || "";
}

export class IttfClient {
  private eventCache: CacheEntry<EventInfo> | null = null;
  private dayCache = new Map<string, CacheEntry<RawMatch[]>>();
  private dayRequests = new Map<string, Promise<RawMatch[]>>();
  private liveCache: CacheEntry<RawMatch[]> | null = null;
  private liveRequest: Promise<RawMatch[]> | null = null;

  async getEventInfo(force = false): Promise<EventInfo> {
    if (!force && this.eventCache && Date.now() - this.eventCache.time < EVENT_CACHE_MS) {
      return this.eventCache.data;
    }

    const raw = await getJson<RawEventInfo>(`${EVENT_BASE}champ.json`);
    const event: EventInfo = {
      champ: raw.champ || EVENT_ID,
      champName: raw.champDesc || "ITTF-ATTU Asian Championships 2026",
      champNameCn: "2026 ITTF-ATTU 亚洲乒乓球锦标赛",
      location: raw.location || "Tashkent",
      locationCn: getLocationCn(raw.location || "Tashkent"),
      datesDesc: raw.datesDesc || "",
      dates: Array.isArray(raw.dates) ? raw.dates : [],
      events: Array.isArray(raw.events) ? raw.events : [],
      locations: Array.isArray(raw.locations) ? raw.locations : [],
      isFinished: Boolean(raw.isFinished),
      sourceUrl: SOURCE_URL
    };

    this.eventCache = { time: Date.now(), data: event };
    return event;
  }

  async getLiveMatches(force = false, eventInfo?: EventInfo): Promise<MatchSummary[]> {
    const event = eventInfo || (await this.getEventInfo());
    const rawLive = await this.getRawLiveMatches(force);
    const dates = [
      ...new Set(
        rawLive
          .map((match) => inferDate(match, event.dates))
          .filter((date): date is string => Boolean(date))
      )
    ];
    const dayMatches = new Map<string, RawMatch>();

    await Promise.all(
      dates.map(async (date) => {
        try {
          for (const match of await this.getDayMatches(date, force)) {
            if (match?.Key) dayMatches.set(match.Key, match);
          }
        } catch (error) {
          console.warn(`ITTF ${date} day data unavailable for live merge`, error);
        }
      })
    );

    return rawLive
      .map((match) => {
        const date = inferDate(match, event.dates) || event.dates[0]?.raw || "";
        return this.toSummary(mergeRawMatch(dayMatches.get(match.Key), match), date);
      })
      .filter((match) => match.status === "LIVE");
  }

  private async getRawLiveMatches(force = false): Promise<RawMatch[]> {
    if (!force && this.liveCache && Date.now() - this.liveCache.time < LIVE_CACHE_MS) {
      return this.liveCache.data;
    }

    if (this.liveRequest) return this.liveRequest;

    const stale = this.liveCache?.data;
    this.liveRequest = getJson<RawMatch[]>(`${EVENT_BASE}match/live.json`)
      .then((rawLive) => {
        this.liveCache = { time: Date.now(), data: rawLive };
        return rawLive;
      })
      .catch((error) => {
        if (stale) {
          console.warn("ITTF live request failed, using cached data", error);
          return stale;
        }
        throw error;
      })
      .finally(() => {
        this.liveRequest = null;
      });

    return this.liveRequest;
  }

  async getDayMatches(date: string, force = false): Promise<RawMatch[]> {
    const cached = this.dayCache.get(date);
    if (!force && cached && Date.now() - cached.time < DAY_CACHE_MS) {
      return cached.data;
    }

    const pending = this.dayRequests.get(date);
    if (pending) return pending;

    const request = getJson<RawMatch[]>(`${EVENT_BASE}match/d${date}.json`)
      .then((data) => {
        this.dayCache.set(date, { time: Date.now(), data });
        return data;
      })
      .catch((error) => {
        if (cached) {
          console.warn(`ITTF ${date} request failed, using cached data`, error);
          return cached.data;
        }
        throw error;
      })
      .finally(() => {
        this.dayRequests.delete(date);
      });

    this.dayRequests.set(date, request);
    return request;
  }

  async getMatches(date: string, force = false): Promise<MatchSummary[]> {
    const event = await this.getEventInfo();
    const [dayMatches, liveMatches] = await Promise.all([
      this.getDayMatches(date, force),
      this.getRawLiveMatches(force)
    ]);

    const merged = new Map<string, RawMatch>();
    for (const match of dayMatches) {
      if (match?.Key) merged.set(match.Key, match);
    }
    for (const match of liveMatches) {
      if (!match?.Key) continue;
      if (merged.has(match.Key) || inferDate(match, event.dates) === date) {
        merged.set(match.Key, mergeRawMatch(merged.get(match.Key), match));
      }
    }

    return [...merged.values()]
      .map((match) => this.toSummary(match, date))
      .sort((left, right) => {
        if (left.status === "LIVE" && right.status !== "LIVE") return -1;
        if (right.status === "LIVE" && left.status !== "LIVE") return 1;
        if (left.status === "SCHEDULED" && right.status === "SCHEDULED") {
          return left.time.localeCompare(right.time);
        }
        if (left.status === "OFFICIAL" && right.status === "OFFICIAL") {
          return right.time.localeCompare(left.time);
        }
        return left.tableNumber.localeCompare(right.tableNumber);
      });
  }

  private toSummary(raw: RawMatch, date: string): MatchSummary {
    const eventKey = getEventKey(raw.Key);
    let status = parseStatus(raw.Status);
    const home = parseCompetitor(raw.Home, Boolean(raw.IsTeam && raw.Home?.TeamReg));
    const away = parseCompetitor(raw.Away, Boolean(raw.IsTeam && raw.Away?.TeamReg));
    const periods = raw.IsTeam ? [] : parsePeriods(raw.Home, raw.Away);
    let rubbers = raw.IsTeam ? parseRubbers(raw.SubMatches) : [];

    if (raw.IsTeam) {
      home.members = enrichTeamMembers(home, rubbers, "home").members;
      away.members = enrichTeamMembers(away, rubbers, "away").members;
    }

    const computedHomeScore = periods.filter((period) => period.winner === "home").length;
    const computedAwayScore = periods.filter((period) => period.winner === "away").length;
    const teamHomeScore = rubbers.filter((rubber) => rubber.winner === "home").length;
    const teamAwayScore = rubbers.filter((rubber) => rubber.winner === "away").length;
    const seriesHomeScore = raw.IsTeam ? teamHomeScore : computedHomeScore;
    const seriesAwayScore = raw.IsTeam ? teamAwayScore : computedAwayScore;

    status = inferMatchStatus(
      raw.Status,
      Boolean(raw.IsTeam),
      periods,
      rubbers,
      seriesHomeScore,
      seriesAwayScore,
      Boolean(raw.Home?.Win || raw.Away?.Win)
    );

    // A stale live payload can keep Status=2 after the deciding rubber is complete.
    if (seriesHomeScore >= 3 || seriesAwayScore >= 3) {
      status = "OFFICIAL";
    }

    if (status === "OFFICIAL" && raw.IsTeam) {
      rubbers = rubbers.filter(
        (rubber) =>
          rubber.homeScore > 0 ||
          rubber.awayScore > 0 ||
          rubber.periods.length > 0
      );
    }

    if (raw.IsTeam) {
      if (seriesHomeScore >= 3 || seriesAwayScore >= 3) {
        home.score = teamHomeScore;
        away.score = teamAwayScore;
      } else if (hasRawValue(raw.Home?.TeamResult) || hasRawValue(raw.Away?.TeamResult)) {
        home.score = toNumber(raw.Home?.TeamResult);
        away.score = toNumber(raw.Away?.TeamResult);
      } else if (status === "LIVE") {
        home.score = teamHomeScore;
        away.score = teamAwayScore;
      }
    } else {
      if (computedHomeScore > 0 || computedAwayScore > 0) {
        home.score = computedHomeScore;
        away.score = computedAwayScore;
      }
    }

    const winnerSide =
      status === "OFFICIAL"
        ? getSideWinner(home.score, away.score, raw.Home?.Win) ||
          (raw.Away?.Win && away.score >= home.score ? "away" : null)
        : raw.Home?.Win
          ? "home"
          : raw.Away?.Win
            ? "away"
            : null;
    home.winner = winnerSide === "home";
    away.winner = winnerSide === "away";
    const currentRubber =
      status === "LIVE" && raw.IsTeam
        ? pickCurrentRubber(rubbers, raw.Home, raw.Away)
        : null;
    const currentPeriod =
      status === "LIVE"
        ? raw.IsTeam
          ? getLivePeriod(currentRubber?.periods || [])
          : getLivePeriod(periods)
        : null;

    return {
      id: raw.Key,
      key: raw.Key,
      eventKey,
      eventName: getEventNameEn(eventKey),
      eventNameCn: getEventNameCn(eventKey),
      roundName: String(raw.Desc || "").replace(getEventNameEn(eventKey), "").replace(/^\s*-\s*/, ""),
      roundNameCn: getRoundNameCn(raw.Desc, eventKey),
      phaseKey: raw.Key,
      date,
      time: formatTime(raw),
      table: formatTable(raw),
      tableNumber: String(raw.Loc || ""),
      venue: raw.Venue || "Olympic Town, Tashkent",
      status,
      statusLabel: getStatusLabel(
        status === "OFFICIAL" ? 1 : status === "LIVE" ? 2 : 0
      ),
      isTeam: Boolean(raw.IsTeam),
      bestOf: raw.IsTeam ? 5 : 5,
      duration: String(raw.Duration || ""),
      home,
      away,
      periods,
      rubbers,
      currentPeriod,
      currentRubber,
      winnerSide,
      sourceUrl: SOURCE_URL
    };
  }
}

export const ittfClient = new IttfClient();
