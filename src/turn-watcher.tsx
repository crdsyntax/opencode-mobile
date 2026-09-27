import { useEffect, useState } from "react";
import { useConnection } from "./connection";
import type { ChatMessage } from "./protocol";
import { configureNotifications, notifyTurnFinished } from "./notifications";

/**
 * Watches every session and raises a local notification when a turn finishes.
 *
 * The device already holds an event stream to the server, so this needs no push service: it works
 * whenever the app process is alive, in the foreground or backgrounded. It deliberately does not
 * reimplement the event reducer. A frame only marks a session as "something happened"; the outcome
 * is decided by re-reading that session, because only the finished message knows whether it carried
 * an error.
 */

let activeSession: string | undefined;

/** The session currently on screen, so its own completions do not raise a notification. */
export function setActiveSession(sessionID: string | undefined) {
  activeSession = sessionID;
}

type Debug = { events: number; lastEvent: string; settles: number; notified: number; problem: string };
let debug: Debug = { events: 0, lastEvent: "-", settles: 0, notified: 0, problem: "-" };
const debugListeners = new Set<(value: Debug) => void>();
function setDebug(patch: Partial<Debug>) {
  debug = { ...debug, ...patch };
  for (const listener of debugListeners) listener(debug);
}
export function useWatcherDebug() {
  const [value, setValue] = useState(debug);
  useEffect(() => {
    debugListeners.add(setValue);
    return () => {
      debugListeners.delete(setValue);
    };
  }, []);
  return value;
}

const SETTLE_MS = 1500;

function lastText(message: ChatMessage) {
  if (message.role !== "assistant") return undefined;
  for (let index = message.items.length - 1; index >= 0; index--) {
    const item = message.items[index];
    if (item.kind === "text" && item.text.trim()) return item.text;
  }
  return undefined;
}

export function TurnWatcher() {
  const { client } = useConnection();

  useEffect(() => {
    void configureNotifications();
  }, []);

  useEffect(() => {
    if (!client) return;
    const controller = new AbortController();
    const notified = new Set<string>();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const titles = new Map<string, string>();

    const titleFor = async (sessionID: string) => {
      const known = titles.get(sessionID);
      if (known) return known;
      try {
        const list = await client.sessions();
        for (const session of list) titles.set(session.id, session.title || session.id.slice(0, 8));
      } catch {
        return "Sesion";
      }
      return titles.get(sessionID) ?? "Sesion";
    };

    const settle = async (sessionID: string) => {
      setDebug({ settles: debug.settles + 1 });
      try {
        const messages = await client.messages(sessionID);
        const last = messages[messages.length - 1];
        console.warn(
          "[watcher] settle",
          sessionID,
          "mensajes=" + messages.length,
          "ultimo=" + (last ? last.role : "ninguno"),
          "completed=" + (last && last.role === "assistant" ? String(last.completed) : "-"),
        );
        for (let index = messages.length - 1; index >= 0; index--) {
          const message = messages[index]
          // Only a finished assistant turn is worth announcing, and only the newest one.
          if (message.role !== "assistant" || !message.completed) break;
          if (notified.has(message.id)) {
            console.warn("[watcher] ya avisado", message.id);
            return;
          }
          notified.add(message.id);
          const aborted = /abort/i.test(message.error ?? "");
          if (aborted) {
            console.warn("[watcher] turno abortado, no avisa");
            return;
          }
          const outcome = message.error ? "failure" : "success";
          await notifyTurnFinished({
            sessionTitle: await titleFor(sessionID),
            outcome,
            preview: lastText(message),
            errorText: message.error,
          });
          console.warn("[watcher] notificacion enviada", outcome, message.id);
          setDebug({ notified: debug.notified + 1, problem: `enviado (${outcome})` });
          return;
        }
        setDebug({ problem: "sin turno completado" });
      } catch (cause) {
        console.warn("[watcher] settle fallo", cause);
        setDebug({ problem: `error: ${cause instanceof Error ? cause.message : String(cause)}` });
      }
    };

    const touch = (sessionID: string | undefined) => {
      if (!sessionID) return;
      const existing = timers.get(sessionID);
      if (existing) clearTimeout(existing);
      timers.set(
        sessionID,
        setTimeout(() => {
          timers.delete(sessionID);
          if (sessionID === activeSession) return;
          void settle(sessionID);
        }, SETTLE_MS),
      );
    };

    const sessionIDOf = (properties: Record<string, unknown>) => {
      const direct = properties.sessionID ?? properties.sessionId;
      if (typeof direct === "string") return direct;
      const info = properties.info as Record<string, unknown> | undefined;
      return typeof info?.sessionID === "string" ? (info.sessionID as string) : undefined;
    };

    console.warn("[watcher] abriendo stream", "url=" + client.baseUrl, "dir=" + JSON.stringify(client.directory));
    void client
      .subscribeEvents(controller.signal, (event) => {
        setDebug({ events: debug.events + 1, lastEvent: event.type });
        console.warn("[watcher] evento", event.type);
        if (!event.type.startsWith("message.")) return;
        touch(sessionIDOf(event.properties));
      })
      .catch((cause) => {
        console.warn("[watcher] stream fallo", cause);
        setDebug({ problem: `stream: ${cause instanceof Error ? cause.message : String(cause)}` });
      });

    return () => {
      controller.abort();
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, [client]);

  return null;
}
