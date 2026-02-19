import Dexie, { type EntityTable } from "dexie";

export interface Session {
  id: string;
  name: string;
  updatedAt: Date;
}

export interface MessagePart {
  type: string;
  text?: string;
  mediaType?: string;
  filename?: string;
  url?: string;
}

export type Message = {
  id: string;
  parts: MessagePart[];
  role: "user" | "assistant";
  sessionId: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
};

export interface ImagesDataPart {
  images: Blob[];
  urls?: string[];
}

export const db = new Dexie("CF_AI_DB") as Dexie & {
  session: EntityTable<Session, "id">;
  message: EntityTable<Message, "id">;
};

db.version(1).stores({
  session: "&id, name, updatedAt",
  message: "&id, sessionId, role, createdAt",
});
