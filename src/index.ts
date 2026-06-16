import {MonitorRepository} from "./db/repository";
import {runMonitor} from "./pipeline/monitor";
import type {Env} from "./types";
import {assertAdmin, jsonResponse} from "./utils/http";

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runMonitor(env, "cron"));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({ok: true});
    }
    if (url.pathname.startsWith("/admin/")) {
      const unauthorized = assertAdmin(request, env.ADMIN_TOKEN);
      if (unauthorized) {
        return unauthorized;
      }
    }
    if (request.method === "POST" && url.pathname === "/admin/monitor/run") {
      const summary = await runMonitor(env, "manual");
      return jsonResponse(summary);
    }
    if (request.method === "GET" && url.pathname === "/admin/monitor/runs") {
      const repository = new MonitorRepository(env.DB);
      return jsonResponse(await repository.listRuns(limitFrom(url, 20, 100)));
    }
    if (request.method === "GET" && url.pathname === "/admin/monitor/events") {
      const repository = new MonitorRepository(env.DB);
      return jsonResponse(await repository.listEvents(
        url.searchParams.get("status") ?? "pending",
        limitFrom(url, 100, 500),
      ));
    }
    const eventAction = matchEventAction(request.method, url.pathname);
    if (eventAction) {
      const repository = new MonitorRepository(env.DB);
      await repository.markEvent(eventAction.id, eventAction.status);
      return jsonResponse({ok: true});
    }
    return jsonResponse({error: "Not found"}, {status: 404});
  },
};

function matchEventAction(method: string, pathname: string): {
  id: number;
  status: "acknowledged" | "ignored" | "consumed";
} | null {
  if (method !== "POST") {
    return null;
  }
  const match = pathname.match(/^\/admin\/monitor\/events\/(\d+)\/(acknowledge|ignore|consume)$/);
  if (!match) {
    return null;
  }
  const actionToStatus = {
    acknowledge: "acknowledged",
    ignore: "ignored",
    consume: "consumed",
  } as const;
  return {
    id: Number(match[1]),
    status: actionToStatus[match[2] as keyof typeof actionToStatus],
  };
}

function limitFrom(url: URL, fallback: number, max: number): number {
  const value = Number(url.searchParams.get("limit") ?? fallback);
  if (!Number.isFinite(value) || value < 1) {
    return fallback;
  }
  return Math.min(Math.floor(value), max);
}
