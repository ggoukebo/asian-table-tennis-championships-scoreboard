import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";
import { ittfClient } from "./ittfClient.ts";

const app = express();
const PORT = Number(process.env.PORT) || 3010;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distWeb = path.resolve(__dirname, "../dist/web");

app.disable("x-powered-by");
app.use(express.json());

function sendError(res: express.Response, error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  console.error(fallback, error);
  res.status(502).json({ error: message });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "asian-table-tennis-scoreboard" });
});

app.get("/api/event", async (_req, res) => {
  try {
    res.json(await ittfClient.getEventInfo());
  } catch (error) {
    sendError(res, error, "无法读取 ITTF 赛事信息");
  }
});

app.get("/api/matches", async (req, res) => {
  try {
    const event = await ittfClient.getEventInfo();
    const requestedDate =
      (typeof req.query.date === "string" && req.query.date.trim()) ||
      event.dates[event.dates.length - 1]?.raw ||
      event.dates[0]?.raw;

    if (!requestedDate) {
      res.status(400).json({ error: "赛事日期为空" });
      return;
    }

    const force = req.query.refresh === "true";
    const matches = await ittfClient.getMatches(requestedDate, force);
    const liveMatches = matches.filter((match) => match.status === "LIVE");

    res.json({
      matches,
      liveMatches,
      liveCount: liveMatches.length,
      fetchedAt: new Date().toISOString(),
      requestedDate
    });
  } catch (error) {
    sendError(res, error, "无法读取 ITTF 比赛数据");
  }
});

app.get("/api/flag/:code", (req, res) => {
  const code = String(req.params.code || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!code) {
    res.status(400).send("missing flag code");
    return;
  }

  const target = `https://results.ittf.com/ittf-web-results/img/flags-v2/${code}.png`;
  const request = https.get(
    target,
    {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "image/png,image/*,*/*"
      },
      timeout: 10_000
    },
    (upstream) => {
      if (upstream.statusCode && upstream.statusCode >= 300 && upstream.statusCode < 400 && upstream.headers.location) {
        const nextUrl = new URL(upstream.headers.location, target).toString();
        upstream.resume();
        https
          .get(nextUrl, { headers: { "User-Agent": "Mozilla/5.0" } }, (redirected) => {
            if (!redirected.statusCode || redirected.statusCode >= 400) {
              res.status(404).end();
              return;
            }
            res.set("Content-Type", redirected.headers["content-type"] || "image/png");
            res.set("Cache-Control", "public, max-age=86400");
            redirected.pipe(res);
          })
          .on("error", () => res.status(502).end());
        return;
      }

      if (!upstream.statusCode || upstream.statusCode >= 400) {
        upstream.resume();
        res.status(404).end();
        return;
      }

      res.set("Content-Type", upstream.headers["content-type"] || "image/png");
      res.set("Cache-Control", "public, max-age=86400");
      upstream.pipe(res);
    }
  );

  request.on("timeout", () => request.destroy(new Error("flag timeout")));
  request.on("error", () => res.status(502).end());
});

app.use(express.static(distWeb));
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    next();
    return;
  }
  res.sendFile(path.join(distWeb, "index.html"), (error) => {
    if (error) next();
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Asian Championships scoreboard running at http://localhost:${PORT}`);
});
