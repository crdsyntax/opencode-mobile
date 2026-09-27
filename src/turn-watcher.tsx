import { useEffect } from "react";
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
      try {
        const messages = await client.messages(sessionID);
        for (let index = messages.length - 1; index >= 0; index--) {
          const message = messages[index];
          // Only a finished assistant turn is worth announcing, and only the newest one.
          if (message.role !== "assistant" || !message.completed) break;
          if (notified.has(message.id)) return;
          notified.add(message.id);
          const aborted = /abort/i.test(message.error ?? "");
          if (aborted) return;
          await notifyTurnFinished({
            sessionTitle: await titleFor(sessionID),
            outcome: message.error ? "failure" : "success",
            preview: lastText(message),
            errorText: message.error,
          });
          return;
        }
      } catch {
        // A failed read just means no notification this round.
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

    void client
      .subscribeEvents(controller.signal, (event) => {
        if (!event.type.startsWith("message.")) return;
        touch(sessionIDOf(event.properties));
      })
      .catch(() => undefined);

    return () => {
      controller.abort();
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, [client]);

  return null;
}
