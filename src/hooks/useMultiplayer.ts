"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ConnectionStatus =
  | "idle"
  | "creating"
  | "waiting"
  | "joining"
  | "connected"
  | "disconnected"
  | "error";

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const array = new Uint8Array(5);
  crypto.getRandomValues(array);
  for (let i = 0; i < 5; i++) {
    code += chars[array[i] % chars.length];
  }
  return code;
}

export function useMultiplayer(onMessage: (msg: unknown) => void) {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");

  const handlerRef = useRef(onMessage);
  useEffect(() => {
    handlerRef.current = onMessage;
  }, [onMessage]);

  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      connRef.current?.close();
      peerRef.current?.destroy();
    };
  }, []);

  const send = useCallback((msg: unknown) => {
    if (connRef.current?.open) {
      connRef.current.send(msg);
    }
  }, []);

  const createRoom = useCallback(async () => {
    try {
      setStatus("creating");
      setError("");

      const { default: Peer } = await import("peerjs");
      const code = generateRoomCode();
      const peerId = `minigame-uno-${code}`;
      const peer = new Peer(peerId);
      peerRef.current = peer;

      peer.on("open", () => {
        setRoomCode(code);
        setStatus("waiting");
      });

      peer.on("connection", (conn: any) => {
        connRef.current = conn;
        conn.on("open", () => {
          setStatus("connected");
        });
        conn.on("data", (data: unknown) => {
          handlerRef.current(data);
        });
        conn.on("close", () => {
          setStatus("disconnected");
        });
      });

      peer.on("error", (err: any) => {
        if (err.type === "unavailable-id") {
          peer.destroy();
          createRoom();
          return;
        }
        setError(err.message || "Connection error");
        setStatus("error");
      });
    } catch (e: any) {
      setError(e.message || "Failed to create room");
      setStatus("error");
    }
  }, []);

  const joinRoom = useCallback(async (code: string) => {
    try {
      setStatus("joining");
      setError("");

      const { default: Peer } = await import("peerjs");
      const peer = new Peer();
      peerRef.current = peer;

      peer.on("open", () => {
        const hostId = `minigame-uno-${code.toUpperCase()}`;
        const conn = peer.connect(hostId, { reliable: true });
        connRef.current = conn;

        const timeout = setTimeout(() => {
          if (!conn.open) {
            setError("Could not find room. Check the code and try again.");
            setStatus("error");
            peer.destroy();
          }
        }, 10000);

        conn.on("open", () => {
          clearTimeout(timeout);
          setRoomCode(code.toUpperCase());
          setStatus("connected");
        });

        conn.on("data", (data: unknown) => {
          handlerRef.current(data);
        });

        conn.on("close", () => {
          setStatus("disconnected");
        });
      });

      peer.on("error", (err: any) => {
        setError(err.message || "Connection error");
        setStatus("error");
      });
    } catch (e: any) {
      setError(e.message || "Failed to join room");
      setStatus("error");
    }
  }, []);

  const disconnect = useCallback(() => {
    connRef.current?.close();
    peerRef.current?.destroy();
    connRef.current = null;
    peerRef.current = null;
    setStatus("idle");
    setRoomCode("");
    setError("");
  }, []);

  return { status, roomCode, error, createRoom, joinRoom, send, disconnect };
}
