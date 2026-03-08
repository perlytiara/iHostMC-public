/**
 * Server Advisor conversations: encrypt/decrypt messages at rest.
 * Uses ENCRYPTION_KEY when set; otherwise stores plain JSON (dev only).
 */

import { query } from "../db/pool.js";
import { config, hasEncryption } from "../config.js";
import { encrypt as encryptValue, decrypt as decryptValue } from "./encrypt.js";

const PLAIN_PREFIX = "plain:";

function encryptMessages(messagesJson: string): string {
  if (hasEncryption()) return encryptValue(messagesJson);
  return PLAIN_PREFIX + messagesJson;
}

function decryptMessages(stored: string): string {
  if (stored.startsWith(PLAIN_PREFIX)) return stored.slice(PLAIN_PREFIX.length);
  if (hasEncryption()) return decryptValue(stored);
  return stored;
}

export interface AdvisorConversationRow {
  id: string;
  user_id: string;
  title: string;
  server_id: string | null;
  server_name: string | null;
  encrypted_messages: string;
  created_at: Date;
  updated_at: Date;
  archived: boolean;
}

export interface AdvisorConversationPayload {
  id: string;
  title: string;
  serverId: string | null;
  serverName: string | null;
  messages: unknown[];
  createdAt: number;
  updatedAt: number;
  archived: boolean;
}

function rowToPayload(row: AdvisorConversationRow): AdvisorConversationPayload {
  const messagesJson = decryptMessages(row.encrypted_messages);
  let messages: unknown[] = [];
  try {
    const parsed = JSON.parse(messagesJson) as unknown;
    if (Array.isArray(parsed)) messages = parsed;
  } catch {
    // leave empty on parse error
  }
  return {
    id: row.id,
    title: row.title ?? "",
    serverId: row.server_id ?? null,
    serverName: row.server_name ?? null,
    messages,
    createdAt: row.created_at.getTime(),
    updatedAt: row.updated_at.getTime(),
    archived: row.archived ?? false,
  };
}

export async function listConversations(userId: string): Promise<AdvisorConversationPayload[]> {
  const result = await query<AdvisorConversationRow>(
    `SELECT id, user_id, title, server_id, server_name, encrypted_messages, created_at, updated_at, archived
     FROM advisor_conversations WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId]
  );
  return result.rows.map(rowToPayload);
}

export async function getConversation(
  userId: string,
  conversationId: string
): Promise<AdvisorConversationPayload | null> {
  const result = await query<AdvisorConversationRow>(
    `SELECT id, user_id, title, server_id, server_name, encrypted_messages, created_at, updated_at, archived
     FROM advisor_conversations WHERE user_id = $1 AND id = $2`,
    [userId, conversationId]
  );
  const row = result.rows[0];
  return row ? rowToPayload(row) : null;
}

export async function upsertConversation(
  userId: string,
  payload: Omit<AdvisorConversationPayload, "createdAt" | "updatedAt"> & {
    createdAt?: number;
    updatedAt?: number;
  }
): Promise<AdvisorConversationPayload> {
  const messagesJson = JSON.stringify(Array.isArray(payload.messages) ? payload.messages : []);
  const encrypted = encryptMessages(messagesJson);
  const createdAt = payload.createdAt != null ? new Date(payload.createdAt) : new Date();
  const updatedAt = new Date();

  await query(
    `INSERT INTO advisor_conversations (id, user_id, title, server_id, server_name, encrypted_messages, created_at, updated_at, archived)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_id, id) DO UPDATE SET
       title = EXCLUDED.title,
       server_id = EXCLUDED.server_id,
       server_name = EXCLUDED.server_name,
       encrypted_messages = EXCLUDED.encrypted_messages,
       updated_at = EXCLUDED.updated_at,
       archived = EXCLUDED.archived`,
    [
      payload.id,
      userId,
      payload.title ?? "",
      payload.serverId ?? null,
      payload.serverName ?? null,
      encrypted,
      createdAt,
      updatedAt,
      payload.archived ?? false,
    ]
  );

  return {
    id: payload.id,
    title: payload.title ?? "",
    serverId: payload.serverId ?? null,
    serverName: payload.serverName ?? null,
    messages: Array.isArray(payload.messages) ? payload.messages : [],
    createdAt: createdAt.getTime(),
    updatedAt: updatedAt.getTime(),
    archived: payload.archived ?? false,
  };
}

export async function deleteConversation(userId: string, conversationId: string): Promise<boolean> {
  const result = await query(
    "DELETE FROM advisor_conversations WHERE user_id = $1 AND id = $2",
    [userId, conversationId]
  );
  return (result.rowCount ?? 0) > 0;
}
