import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Calendar,
  ChevronDown,
  Clock,
  ExternalLink,
  Flag as FlagIcon,
  MapPin,
  Maximize2,
  Radio,
  RefreshCw,
  Search,
  Table2,
  Trophy,
  Users,
  X,
  Youtube,
  Zap
} from "lucide-react";
import type {
  Competitor,
  EventInfo,
  MatchStatus,
  MatchSummary,
  MatchesResponse,
  Side
} from "../../shared/types.ts";
import { getTableLiveUrl, getYouTubeEmbedUrl } from "./liveStreams.ts";

const POLL_INTERVAL = 4_000;

const STATUS_LABELS: Record<MatchStatus | "ALL", string> = {
  ALL: "全部赛程",
  LIVE: "实时进行",
  SCHEDULED: "即将开始",
  OFFICIAL: "已完赛"
};

const EVENT_LABELS: Record<string, string> = {
  "M.SINGLES-----------": "男单",
  "W.SINGLES-----------": "女单",
  "M.DOUBLES-----------": "男双",
  "W.DOUBLES-----------": "女双",
  "X.DOUBLES-----------": "混双",
  "M.TEAM--------------": "男团",
  "W.TEAM--------------": "女团"
};

function readDateFromHash(): string {
  const match = window.location.hash.match(/results\/(\d{4}-\d{2}-\d{2})/);
  if (match?.[1]) return match[1];

  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${today.getFullYear()}-${month}-${day}`;
}

function writeDateToHash(date: string) {
  const hash = `#/results/${date}`;
  if (window.location.hash !== hash) {
    window.history.replaceState(null, "", hash);
  }
}

function formatDateCn(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return `${parsed.getMonth() + 1}月${parsed.getDate()}日`;
}

function normalizeSearch(value: string): string {
  return value.toLocaleLowerCase("zh-CN").replace(/\s+/g, " ").trim();
}

function competitorSearchText(competitor: Competitor): string {
  return [
    competitor.name,
    competitor.cnName,
    competitor.org,
    competitor.orgName,
    competitor.orgCn,
    ...competitor.members.flatMap((member) => [member.name, member.cnName])
  ].join(" ");
}

function hasLocalizedChineseName(localized: string, original: string): boolean {
  return /[\u3400-\u9fff]/.test(localized) && localized !== original;
}

function getCompetitorDisplayName(competitor: Competitor): {
  primary: string;
  secondary: string;
} {
  const original = competitor.name.trim();
  const localized = competitor.cnName.trim();
  const hasLocalizedName =
    localized !== "待定" && hasLocalizedChineseName(localized, original);
  return {
    primary: hasLocalizedName ? localized : original || "待定",
    secondary: hasLocalizedName ? original : ""
  };
}

function matchSearchText(match: MatchSummary): string {
  return [
    match.eventName,
    match.eventNameCn,
    match.roundName,
    match.roundNameCn,
    match.table,
    match.venue,
    competitorSearchText(match.home),
    competitorSearchText(match.away)
  ].join(" ");
}

function choosePreferredMatch(matches: MatchSummary[]): MatchSummary | null {
  const concrete = (match: MatchSummary) =>
    match.home.name !== "待定" &&
    match.away.name !== "待定" &&
    Boolean(match.home.name) &&
    Boolean(match.away.name);

  return (
    matches.find((match) => match.status === "LIVE" && concrete(match)) ||
    matches.find((match) => match.status === "SCHEDULED" && concrete(match)) ||
    matches.find(concrete) ||
    matches[0] ||
    null
  );
}

function getLiveDisplayScore(match: MatchSummary): {
  label: string;
  homeScore: number;
  awayScore: number;
} | null {
  if (match.status !== "LIVE") return null;

  if (match.currentPeriod) {
    return {
      label: match.isTeam
        ? `当前局 · 第 ${match.currentPeriod.gameNumber} 局`
        : `第 ${match.currentPeriod.gameNumber} 局`,
      homeScore: match.currentPeriod.homeScore,
      awayScore: match.currentPeriod.awayScore
    };
  }

  if (match.isTeam && match.currentRubber) {
    return {
      label: `当前盘 · R${match.currentRubber.number}`,
      homeScore: match.currentRubber.homeScore,
      awayScore: match.currentRubber.awayScore
    };
  }

  return {
    label: match.isTeam ? "团体场分" : "局分",
    homeScore: match.home.score,
    awayScore: match.away.score
  };
}

interface FlagProps {
  org: string;
  size?: "small" | "medium" | "large";
}

function CountryFlag({ org, size = "medium" }: FlagProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [org]);

  if (!org || failed) {
    return (
      <span className={`flag-fallback flag-${size}`} aria-hidden="true">
        {org || "TT"}
      </span>
    );
  }

  return (
    <img
      className={`country-flag flag-${size}`}
      src={`/api/flag/${encodeURIComponent(org)}`}
      alt={`${org} 旗帜`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function StatusBadge({ match }: { match: MatchSummary }) {
  return (
    <span className={`status-badge status-${match.status.toLowerCase()}`}>
      {match.status === "LIVE" && <span className="live-dot" />}
      {match.statusLabel}
    </span>
  );
}

interface CompetitorIdentityProps {
  competitor: Competitor;
  side: Side;
  large?: boolean;
  featuredName?: string;
}

function CompetitorIdentity({
  competitor,
  side,
  large = false,
  featuredName = ""
}: CompetitorIdentityProps) {
  const memberNames = competitor.members.filter(
    (member) => member.name && member.name !== competitor.name
  );
  const displayName = getCompetitorDisplayName(competitor);
  const currentPlayer = featuredName.trim();
  const primaryName = currentPlayer || displayName.primary;
  const secondaryName = currentPlayer ? displayName.primary : displayName.secondary;

  return (
    <div className={`competitor-identity competitor-${side} ${large ? "is-large" : ""}`}>
      <div className={`flag-frame ${competitor.winner ? "is-winner" : ""}`}>
        <CountryFlag org={competitor.org} size={large ? "large" : "medium"} />
        <span className="flag-code">{competitor.org || "TBD"}</span>
      </div>

      <div className="competitor-copy">
        <div className="org-line">
          <span>{competitor.orgCn || competitor.orgName || "待定"}</span>
          {currentPlayer && <span className="current-player-label">当前上场</span>}
        </div>
        <h2 className={competitor.winner ? "winner-name" : ""}>
          {competitor.winner && <Trophy size={large ? 20 : 16} aria-label="胜者" />}
          {primaryName}
        </h2>
        {secondaryName && (
          <p className="english-name">{secondaryName}</p>
        )}

        {!currentPlayer && memberNames.length > 0 && (
          <div className="member-list">
            {memberNames.slice(0, 5).map((member) => (
              <span key={`${member.id}-${member.name}`} className="member-chip">
                {member.cnName || member.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreCenter({ match, large = false }: { match: MatchSummary; large?: boolean }) {
  if (match.status === "SCHEDULED") {
    return (
      <div className={`score-center score-center-upcoming ${large ? "is-large" : ""}`}>
        <span className="upcoming-time">{match.time || "时间待定"}</span>
        <span className="vs-label">VS</span>
        <span className="upcoming-caption">
          <Clock size={14} />
          {match.table}
        </span>
      </div>
    );
  }

  const liveScore = getLiveDisplayScore(match);
  const homeScore = liveScore?.homeScore ?? match.home.score;
  const awayScore = liveScore?.awayScore ?? match.away.score;
  const scoreType =
    liveScore?.label ?? (match.isTeam ? "团体场分" : "总局分");

  return (
    <div className={`score-center ${large ? "is-large" : ""}`}>
      <div className="score-type">{scoreType}</div>
      <div className="score-numbers">
        <span className={match.winnerSide === "home" ? "winner-score" : ""}>
          {homeScore}
        </span>
        <span className="score-colon">:</span>
        <span className={match.winnerSide === "away" ? "winner-score" : ""}>
          {awayScore}
        </span>
      </div>
      {liveScore && (
        <div className="score-context">
          {match.isTeam && match.currentRubber && match.currentPeriod && (
            <span>
              当前盘 R{match.currentRubber.number}
              <strong>
                {match.currentRubber.homeScore}:{match.currentRubber.awayScore}
              </strong>
            </span>
          )}
          <span>
            {match.isTeam ? "场分" : "局分"}
            <strong>{match.home.score}:{match.away.score}</strong>
          </span>
        </div>
      )}
      <div className="score-status-line">
        {match.status === "LIVE" ? (
          <>
            <span className="live-dot" />
            实时比分
          </>
        ) : (
          <>
            <Trophy size={13} />
            官方完赛
          </>
        )}
      </div>
    </div>
  );
}

function GamePills({ match }: { match: MatchSummary }) {
  if (match.isTeam) {
    if (match.rubbers.length === 0) {
      return <span className="breakdown-empty">官方尚未公布单盘阵容</span>;
    }

    return (
      <div className="rubber-pills" aria-label="团体赛单盘比分">
        {match.rubbers.map((rubber) => {
          const isCurrent = match.currentRubber?.number === rubber.number;
          return (
            <div
              key={rubber.number}
              className={`rubber-pill ${rubber.winner ? `winner-${rubber.winner}` : ""} ${isCurrent ? "is-current" : ""}`}
              title={`${rubber.homeCnName} vs ${rubber.awayCnName}`}
            >
              <span className="rubber-number">R{rubber.number}</span>
              <strong>
                {rubber.homeScore}:{rubber.awayScore}
              </strong>
              {isCurrent && match.currentPeriod && (
                <span className="rubber-current-game">
                  局 {match.currentPeriod.homeScore}:{match.currentPeriod.awayScore}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (match.periods.length === 0) {
    return <span className="breakdown-empty">官方尚未录入局分</span>;
  }

  return (
    <div className="period-pills" aria-label="各局比分">
      {match.periods.map((period) => (
        <span
          key={period.gameNumber}
          className={`period-pill ${period.winner ? `winner-${period.winner}` : ""} ${
            match.currentPeriod?.gameNumber === period.gameNumber ? "is-current" : ""
          }`}
        >
          {period.homeScore}:{period.awayScore}
        </span>
      ))}
    </div>
  );
}

interface ScoreboardProps {
  match: MatchSummary;
  onOpenLive: (table: string, liveUrl: string) => void;
  onExpand?: () => void;
  onClose?: () => void;
}

function Scoreboard({ match, onOpenLive, onExpand, onClose }: ScoreboardProps) {
  const isModal = Boolean(onClose);
  const liveStreamUrl = getTableLiveUrl(match.tableNumber);
  const homePlayer =
    match.isTeam && match.status === "LIVE"
      ? match.currentRubber?.homeCnName || match.currentRubber?.homeName || ""
      : "";
  const awayPlayer =
    match.isTeam && match.status === "LIVE"
      ? match.currentRubber?.awayCnName || match.currentRubber?.awayName || ""
      : "";

  return (
    <section className={`scoreboard-board ${isModal ? "is-modal" : ""}`}>
      <header className="board-header">
        <div className="board-tags">
          <StatusBadge match={match} />
          <span className="event-tag">{match.eventNameCn}</span>
          <span className="round-tag">{match.roundNameCn}</span>
        </div>

        <div className="board-meta">
          <span>
            <Calendar size={14} />
            {formatDateCn(match.date)}
          </span>
          <span>
            <Clock size={14} />
            {match.time || "待定"}
          </span>
          {liveStreamUrl ? (
            <button
              type="button"
              className="table-live-link"
              onClick={() => onOpenLive(match.table, liveStreamUrl)}
              title={`在页面内观看${match.table}的 YouTube 直播`}
              aria-label={`在页面内观看${match.table}的 YouTube 直播`}
            >
              <Youtube size={15} />
              <strong>{match.table}</strong>
              <span>直播</span>
            </button>
          ) : (
            <span>
              <MapPin size={14} />
              {match.table}
            </span>
          )}
          {match.duration ? (
            <span>
              <Activity size={14} />
              {match.duration}
            </span>
          ) : null}
        </div>

        {onClose ? (
          <button className="icon-button close-button" onClick={onClose} aria-label="关闭放大看板">
            <X size={21} />
          </button>
        ) : (
          <button className="icon-button" onClick={onExpand} aria-label="放大看板" title="放大看板">
            <Maximize2 size={18} />
          </button>
        )}
      </header>

      <div className="board-arena">
        <CompetitorIdentity
          competitor={match.home}
          side="home"
          large={isModal}
          featuredName={homePlayer}
        />
        <ScoreCenter match={match} large={isModal} />
        <CompetitorIdentity
          competitor={match.away}
          side="away"
          large={isModal}
          featuredName={awayPlayer}
        />
      </div>

      <footer className="board-breakdown">
        <div className="breakdown-label">
          <span>
            {match.status === "LIVE"
              ? match.isTeam
                ? "实时单盘"
                : "实时各局"
              : match.isTeam
                ? "单盘赛果"
                : "各局比分"}
          </span>
          <span className="venue-label">{match.venue}</span>
        </div>
        <GamePills match={match} />
        <a
          className="source-link"
          href={match.sourceUrl}
          target="_blank"
          rel="noreferrer"
          title="打开 ITTF 官方结果页"
        >
          ITTF 官方
          <ArrowUpRight size={14} />
        </a>
      </footer>

      {isModal && (
        <div className="modal-detail-grid">
          <section className="detail-panel">
            <div className="detail-title">
              <Users size={17} />
              双方阵容
            </div>
            <div className="lineup-grid">
              {[match.home, match.away].map((competitor) => (
                <div key={`${competitor.org}-${competitor.id}`} className="lineup-column">
                  <div className="lineup-heading">
                    <CountryFlag org={competitor.org} size="small" />
                    <span>{competitor.orgCn}</span>
                  </div>
                  {competitor.members.length > 0 ? (
                    competitor.members.map((member) => (
                      <div key={`${member.id}-${member.name}`} className="lineup-player">
                        <span>{member.cnName || member.name}</span>
                        {hasLocalizedChineseName(member.cnName, member.name) && (
                          <small>{member.name}</small>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="lineup-empty">官方暂未公布阵容</div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="detail-panel">
            <div className="detail-title">
              <Table2 size={17} />
              {match.isTeam ? "单盘明细" : "逐局明细"}
            </div>
            {match.isTeam ? (
              match.rubbers.length > 0 ? (
                <div className="rubber-table">
                  {match.rubbers.map((rubber) => (
                    <div
                      key={rubber.number}
                      className={`rubber-row ${
                        match.currentRubber?.number === rubber.number ? "is-current" : ""
                      }`}
                    >
                      <span className="rubber-order">R{rubber.number}</span>
                      <span className="rubber-player home">{rubber.homeCnName}</span>
                      <strong className={rubber.winner === "home" ? "winner-score" : ""}>
                        {rubber.homeScore}
                      </strong>
                      <span className="rubber-divider">:</span>
                      <strong className={rubber.winner === "away" ? "winner-score" : ""}>
                        {rubber.awayScore}
                      </strong>
                      <span className="rubber-player away">{rubber.awayCnName}</span>
                      <span className="rubber-games">
                        {rubber.periods.map((period) => (
                          <span
                            key={period.gameNumber}
                            className={
                              match.currentRubber?.number === rubber.number &&
                              match.currentPeriod?.gameNumber === period.gameNumber
                                ? "is-current"
                                : ""
                            }
                          >
                            {period.homeScore}-{period.awayScore}
                          </span>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="detail-empty">官方尚未公布单盘明细</div>
              )
            ) : (
              match.periods.length > 0 ? (
                <div className="period-detail-grid">
                  {match.periods.map((period) => (
                    <div
                      key={period.gameNumber}
                      className={`period-detail-card ${
                        match.currentPeriod?.gameNumber === period.gameNumber ? "is-current" : ""
                      }`}
                    >
                      <span>第 {period.gameNumber} 局</span>
                      <strong className={period.winner ? `winner-${period.winner}` : ""}>
                        {period.homeScore}:{period.awayScore}
                      </strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="detail-empty">官方尚未录入逐局比分</div>
              )
            )}
          </section>
        </div>
      )}
    </section>
  );
}

interface MatchCardProps {
  match: MatchSummary;
  selected: boolean;
  onSelect: () => void;
}

function MatchCard({ match, selected, onSelect }: MatchCardProps) {
  return (
    <button
      type="button"
      className={`match-card ${selected ? "is-selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className="card-topline">
        <div className="card-tags">
          <StatusBadge match={match} />
          <span>{match.eventNameCn}</span>
        </div>
        <span className="card-time">{match.time || "待定"}</span>
      </div>

      <div className="card-round-line">
        <span>{match.roundNameCn}</span>
        <span>{match.table}</span>
      </div>

      <div className="card-competitors">
        {[
          { competitor: match.home, side: "home" as const },
          { competitor: match.away, side: "away" as const }
        ].map(({ competitor, side }) => {
          const displayName = getCompetitorDisplayName(competitor);
          return (
            <div
              key={`${side}-${competitor.id}-${competitor.name}`}
              className={`card-competitor ${competitor.winner ? "is-winner" : ""}`}
            >
              <CountryFlag org={competitor.org} size="small" />
              <div className="card-player-copy">
                <strong>{displayName.primary}</strong>
                {displayName.secondary && <small>{displayName.secondary}</small>}
              </div>
              <span className="card-score">
                {match.status === "SCHEDULED" ? "-" : competitor.score}
              </span>
            </div>
          );
        })}
      </div>

      <div className="card-breakdown">
        <GamePills match={match} />
      </div>
    </button>
  );
}

function LiveRail({
  matches,
  onOpenLive,
  onSelect
}: {
  matches: MatchSummary[];
  onOpenLive: () => void;
  onSelect: (match: MatchSummary) => void;
}) {
  if (matches.length === 0) return null;

  return (
    <aside className="live-rail" aria-label="正在进行的比赛">
      <button className="live-rail-title" onClick={onOpenLive}>
        <span className="live-orb">
          <Radio size={16} />
        </span>
        <span>
          <strong>{matches.length} 场正在进行</strong>
          <small>点击查看全部实时比分</small>
        </span>
      </button>
      <div className="live-rail-list">
        {matches.slice(0, 3).map((match) => {
          const liveScore = getLiveDisplayScore(match);
          return (
            <button key={match.key} className="live-mini" onClick={() => onSelect(match)}>
              <span className="live-mini-event">{match.eventNameCn}</span>
              <span className="live-mini-score">
                {match.home.org} {match.home.score}:{match.away.score} {match.away.org}
              </span>
              {liveScore && (
                <span className="live-mini-current">
                  {liveScore.label} {liveScore.homeScore}:{liveScore.awayScore}
                </span>
              )}
              <span className="live-mini-meta">{match.table} · {match.time}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

export default function App() {
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null);
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [liveMatches, setLiveMatches] = useState<MatchSummary[]>([]);
  const [selectedDate, setSelectedDate] = useState(readDateFromHash);
  const [selectedStatus, setSelectedStatus] = useState<MatchStatus | "ALL">("ALL");
  const [selectedEvent, setSelectedEvent] = useState("ALL");
  const [selectedTable, setSelectedTable] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [liveStream, setLiveStream] = useState<{ table: string; embedUrl: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadEvent = useCallback(async () => {
    const response = await fetch("/api/event");
    if (!response.ok) throw new Error(`赛事信息读取失败 (${response.status})`);
    const data: EventInfo = await response.json();
    setEventInfo(data);
    return data;
  }, []);

  const loadMatches = useCallback(
    async (date: string, force = false, silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const query = new URLSearchParams({ date });
        if (force) query.set("refresh", "true");
        const response = await fetch(`/api/matches?${query.toString()}`);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || `比赛数据读取失败 (${response.status})`);
        }
        const data: MatchesResponse = await response.json();
        setMatches(data.matches || []);
        setLiveMatches(data.liveMatches || []);
        setLastUpdated(
          new Date(data.fetchedAt).toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
          })
        );
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "网络请求异常");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    let active = true;
    loadEvent()
      .then((event) => {
        if (!active) return;
        const requested = readDateFromHash();
        const available = event.dates.map((date) => date.raw);
        if (available.length > 0 && !available.includes(requested)) {
          setSelectedDate(available[available.length - 1]);
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : "赛事信息读取失败");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [loadEvent]);

  useEffect(() => {
    writeDateToHash(selectedDate);
    loadMatches(selectedDate);
  }, [loadMatches, selectedDate]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      loadMatches(selectedDate, true, true);
    }, POLL_INTERVAL);
    return () => window.clearInterval(timer);
  }, [autoRefresh, loadMatches, selectedDate]);

  useEffect(() => {
    if (!modalOpen && !liveStream) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (liveStream) {
        setLiveStream(null);
      } else {
        setModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [liveStream, modalOpen]);

  const sourceMatches = useMemo(() => {
    if (selectedStatus === "LIVE") return liveMatches;
    return matches;
  }, [liveMatches, matches, selectedStatus]);

  const availableTables = useMemo(
    () => [...new Set(sourceMatches.map((match) => match.tableNumber).filter(Boolean))].sort(),
    [sourceMatches]
  );

  const filteredMatches = useMemo(() => {
    const query = normalizeSearch(searchQuery);
    return sourceMatches.filter((match) => {
      if (selectedStatus !== "ALL" && match.status !== selectedStatus) return false;
      if (selectedEvent !== "ALL" && match.eventKey !== selectedEvent) return false;
      if (selectedTable !== "ALL" && match.tableNumber !== selectedTable) return false;
      if (query && !normalizeSearch(matchSearchText(match)).includes(query)) return false;
      return true;
    });
  }, [searchQuery, selectedEvent, selectedStatus, selectedTable, sourceMatches]);

  useEffect(() => {
    if (selectedTable !== "ALL" && !sourceMatches.some((match) => match.tableNumber === selectedTable)) {
      setSelectedTable("ALL");
    }
  }, [selectedTable, sourceMatches]);

  useEffect(() => {
    if (filteredMatches.length === 0) {
      setSelectedKey(null);
      setModalOpen(false);
      return;
    }
    const stillVisible = filteredMatches.some((match) => match.key === selectedKey);
    if (!stillVisible) {
      setSelectedKey(choosePreferredMatch(filteredMatches)?.key || null);
      setModalOpen(false);
    }
  }, [filteredMatches, selectedKey]);

  const selectedMatch = useMemo(() => {
    if (!selectedKey) return choosePreferredMatch(filteredMatches);
    return (
      filteredMatches.find((match) => match.key === selectedKey) ||
      matches.find((match) => match.key === selectedKey) ||
      liveMatches.find((match) => match.key === selectedKey) ||
      null
    );
  }, [filteredMatches, liveMatches, matches, selectedKey]);

  const statusCounts = useMemo(
    () => ({
      all: matches.length,
      live: liveMatches.length,
      scheduled: matches.filter((match) => match.status === "SCHEDULED").length,
      official: matches.filter((match) => match.status === "OFFICIAL").length
    }),
    [liveMatches.length, matches]
  );

  const selectedEventInfo = eventInfo?.events.find((event) => event.Key === selectedEvent);
  const hasFilters =
    selectedStatus !== "ALL" ||
    selectedEvent !== "ALL" ||
    selectedTable !== "ALL" ||
    Boolean(searchQuery);

  const resetFilters = () => {
    setSelectedStatus("ALL");
    setSelectedEvent("ALL");
    setSelectedTable("ALL");
    setSearchQuery("");
  };

  const openLive = () => {
    setSelectedStatus("LIVE");
    setSelectedEvent("ALL");
    setSelectedTable("ALL");
    setSearchQuery("");
  };

  const selectLiveMatch = (match: MatchSummary) => {
    setSelectedStatus("LIVE");
    setSelectedEvent("ALL");
    setSelectedTable("ALL");
    setSelectedKey(match.key);
  };

  const openTableLive = (table: string, liveUrl: string) => {
    const embedUrl = getYouTubeEmbedUrl(liveUrl);
    if (embedUrl) setLiveStream({ table, embedUrl });
  };

  const selectDate = (date: string) => {
    setMatches([]);
    setSelectedDate(date);
    setSelectedStatus("ALL");
    setSelectedEvent("ALL");
    setSelectedTable("ALL");
    setSelectedKey(null);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span>TT</span>
            <i />
          </div>
          <div className="brand-copy">
            <div className="brand-eyebrow">
              ITTF-ATTU ASIAN CHAMPIONSHIPS
              <span>2026</span>
            </div>
            <h1>亚洲乒乓球锦标赛</h1>
            <p>
              <MapPin size={13} />
              乌兹别克斯坦 · 塔什干
              <span className="meta-separator" />
              {eventInfo?.datesDesc || "10月19-25日"}
            </p>
          </div>
        </div>

        <div className="header-tools">
          <label className="search-field">
            <Search size={16} />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索球员、协会、轮次或球台"
              aria-label="搜索比赛"
            />
            {searchQuery ? (
              <button onClick={() => setSearchQuery("")} aria-label="清空搜索">
                <X size={14} />
              </button>
            ) : null}
          </label>

          <button
            className={`tool-button ${autoRefresh ? "is-active" : ""}`}
            onClick={() => setAutoRefresh((current) => !current)}
            title={autoRefresh ? "关闭 4 秒自动刷新" : "开启 4 秒自动刷新"}
          >
            <Zap size={15} />
            {autoRefresh ? "自动刷新" : "已暂停"}
          </button>

          <button
            className="tool-button primary-tool"
            onClick={() => loadMatches(selectedDate, true)}
            disabled={refreshing}
          >
            <RefreshCw size={15} className={refreshing ? "spin" : ""} />
            刷新
          </button>

          <a className="tool-button source-tool" href={eventInfo?.sourceUrl || "#"} target="_blank" rel="noreferrer">
            <ExternalLink size={15} />
            官方结果
          </a>
        </div>
      </header>

      <main>
        <section className="control-deck">
          <div className="date-strip-wrap">
            <div className="deck-label">
              <Calendar size={16} />
              比赛日
            </div>
            <div className="date-strip">
              {(eventInfo?.dates || []).map((date) => (
                <button
                  key={date.raw}
                  className={`date-button ${selectedDate === date.raw ? "is-active" : ""}`}
                  onClick={() => selectDate(date.raw)}
                >
                  <span>{date.month}</span>
                  <strong>{date.day}</strong>
                  <small>{date.forCal.split(",")[0]}</small>
                </button>
              ))}
            </div>
            <div className="date-summary">
              <strong>{formatDateCn(selectedDate)}</strong>
              <span>{filteredMatches.length} 场符合筛选</span>
            </div>
          </div>

          <div className="status-row">
            <div className="status-tabs">
              {(["ALL", "LIVE", "SCHEDULED", "OFFICIAL"] as const).map((status) => {
                const count =
                  status === "ALL"
                    ? statusCounts.all
                    : status === "LIVE"
                      ? statusCounts.live
                      : status === "SCHEDULED"
                        ? statusCounts.scheduled
                        : statusCounts.official;
                return (
                  <button
                    key={status}
                    className={`status-tab ${selectedStatus === status ? "is-active" : ""}`}
                    onClick={() => setSelectedStatus(status)}
                  >
                    {status === "LIVE" && <span className="live-dot" />}
                    {STATUS_LABELS[status]}
                    <span>{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="filter-tools">
              <label className="select-field">
                <span>球台</span>
                <select value={selectedTable} onChange={(event) => setSelectedTable(event.target.value)}>
                  <option value="ALL">全部球台</option>
                  {availableTables.map((table) => (
                    <option key={table} value={table}>
                      {table.replace("T", "球台 ")}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} />
              </label>
              {hasFilters ? (
                <button className="reset-button" onClick={resetFilters}>
                  重置筛选
                </button>
              ) : null}
            </div>
          </div>

          <div className="event-row">
            <div className="event-tabs">
              <button
                className={`event-tab ${selectedEvent === "ALL" ? "is-active" : ""}`}
                onClick={() => setSelectedEvent("ALL")}
              >
                <FlagIcon size={15} />
                全部项目
              </button>
              {(eventInfo?.events || []).map((event) => {
                const cn = EVENT_LABELS[event.Key] || event.Desc;
                return (
                  <button
                    key={event.Key}
                    className={`event-tab ${selectedEvent === event.Key ? "is-active" : ""}`}
                    onClick={() => setSelectedEvent(event.Key)}
                  >
                    {cn}
                  </button>
                );
              })}
            </div>
            <div className="update-status">
              <span className={`sync-indicator ${autoRefresh ? "is-live" : ""}`} />
              {selectedEventInfo
                ? `${EVENT_LABELS[selectedEventInfo.Key] || selectedEventInfo.Desc} · `
                : ""}
              {lastUpdated ? `数据更新于 ${lastUpdated}` : "正在连接官方数据"}
            </div>
          </div>
        </section>

        <LiveRail matches={liveMatches} onOpenLive={openLive} onSelect={selectLiveMatch} />

        {selectedMatch ? (
          <Scoreboard
            match={selectedMatch}
            onOpenLive={openTableLive}
            onExpand={() => setModalOpen(true)}
          />
        ) : (
          <section className="empty-board">
            <div className="empty-mark">
              <Activity size={24} />
            </div>
            <h2>{loading ? "正在读取官方赛果" : "当前筛选没有比赛"}</h2>
            <p>{loading ? "正在从 ITTF 赛事系统同步比分与赛程。" : "可以切换比赛日、项目或球台查看其他对阵。"}</p>
          </section>
        )}

        <section className="schedule-section">
          <div className="section-heading">
            <div>
              <span className="section-kicker">MATCH DESK</span>
              <h2>赛程与比分</h2>
            </div>
            <div className="section-actions">
              <span>{filteredMatches.length} 场比赛</span>
              <button className="link-button" onClick={() => loadMatches(selectedDate, true, true)}>
                <RefreshCw size={14} className={refreshing ? "spin" : ""} />
                同步官方
              </button>
            </div>
          </div>

          {error ? (
            <div className="error-banner">
              <span>{error}</span>
              <button onClick={() => loadMatches(selectedDate, true)}>重新连接</button>
            </div>
          ) : null}

          {loading && matches.length === 0 ? (
            <div className="loading-grid">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="loading-card" />
              ))}
            </div>
          ) : filteredMatches.length > 0 ? (
            <div className="match-grid">
              {filteredMatches.map((match) => (
                <MatchCard
                  key={match.key}
                  match={match}
                  selected={selectedMatch?.key === match.key}
                  onSelect={() => {
                    setSelectedKey(match.key);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="empty-results">
              <span className="empty-results-icon">
                <Search size={22} />
              </span>
              <h3>没有找到符合条件的比赛</h3>
              <p>尝试清除搜索或切换到“全部项目”。</p>
              <button className="tool-button" onClick={resetFilters}>
                清除筛选
              </button>
            </div>
          )}
        </section>
      </main>

      <footer className="app-footer">
        <span>数据来源：ITTF 官方赛事结果系统</span>
        <span>比分以官方现场系统为准 · 自动刷新间隔 4 秒</span>
      </footer>

      {modalOpen && selectedMatch ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setModalOpen(false);
          }}
        >
          <div className="modal-shell" role="dialog" aria-modal="true" aria-label="比赛详细信息">
            <Scoreboard
              match={selectedMatch}
              onOpenLive={openTableLive}
              onClose={() => setModalOpen(false)}
            />
          </div>
        </div>
      ) : null}

      {liveStream ? (
        <div
          className="live-player-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setLiveStream(null);
          }}
        >
          <div
            className="live-player-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="live-player-title"
          >
            <header className="live-player-header">
              <div className="live-player-heading">
                <span className="live-player-kicker">
                  <Youtube size={16} />
                  LIVE
                </span>
                <h2 id="live-player-title">{liveStream.table} 直播</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setLiveStream(null)}
                aria-label="关闭直播播放器"
                autoFocus
              >
                <X size={20} />
              </button>
            </header>
            <div className="live-player-frame">
              <iframe
                src={liveStream.embedUrl}
                title={`${liveStream.table} YouTube 直播`}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
