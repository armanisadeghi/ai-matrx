/**
 * Prompt Actions Service
 *
 * NOTE: The `prompt_actions` table has been moved to the graveyard schema and is no longer
 * reachable via PostgREST. All functions below fail-soft (return null/empty/false) and
 * log a console.warn so callers don't 500 but problems are visible.
 * This service is part of the decommissioned prompt-actions surface.
 */

import { buildSearchOr } from "@/utils/supabase-search";
import type {
  PromptAction,
  CreateActionPayload,
  UpdateActionPayload,
  ActionSummary,
} from "../types/promptActionTypes";

const DECOMMISSION_WARN = (fn: string) =>
  console.warn(`[prompt-actions/action-service] ${fn}: prompt_actions table is in graveyard schema — returning empty`);

/**
 * Get a single action by ID
 */
export async function getAction(id: string): Promise<PromptAction | null> {
  DECOMMISSION_WARN(`getAction(${id})`);
  return null;
}

/**
 * Get all actions for a user
 */
export async function getUserActions(userId: string): Promise<PromptAction[]> {
  DECOMMISSION_WARN(`getUserActions(${userId})`);
  return [];
}

/**
 * Get public actions (available to all users)
 */
export async function getPublicActions(): Promise<PromptAction[]> {
  DECOMMISSION_WARN("getPublicActions()");
  return [];
}

/**
 * Get actions accessible to a user (their own + public)
 */
export async function getAccessibleActions(
  userId: string,
): Promise<PromptAction[]> {
  DECOMMISSION_WARN(`getAccessibleActions(${userId})`);
  return [];
}

/**
 * Get action summaries (lightweight data for lists)
 */
export async function getActionSummaries(
  userId: string,
): Promise<ActionSummary[]> {
  DECOMMISSION_WARN(`getActionSummaries(${userId})`);
  return [];
}

/**
 * Get actions by tag
 */
export async function getActionsByTag(
  tag: string,
  userId: string,
): Promise<PromptAction[]> {
  DECOMMISSION_WARN(`getActionsByTag(${tag}, ${userId})`);
  return [];
}

/**
 * Get actions for a specific prompt
 */
export async function getActionsForPrompt(
  promptId: string,
  userId: string,
): Promise<PromptAction[]> {
  DECOMMISSION_WARN(`getActionsForPrompt(${promptId}, ${userId})`);
  return [];
}

/**
 * Create a new action
 */
export async function createAction(
  payload: CreateActionPayload,
  userId: string,
): Promise<PromptAction | null> {
  DECOMMISSION_WARN(`createAction(${userId})`);
  void payload;
  return null;
}

/**
 * Update an existing action
 */
export async function updateAction(
  id: string,
  payload: UpdateActionPayload,
): Promise<PromptAction | null> {
  DECOMMISSION_WARN(`updateAction(${id})`);
  void payload;
  return null;
}

/**
 * Soft delete an action (set is_active = false)
 */
export async function deleteAction(id: string): Promise<boolean> {
  DECOMMISSION_WARN(`deleteAction(${id})`);
  return false;
}

/**
 * Hard delete an action (permanent)
 */
export async function permanentlyDeleteAction(id: string): Promise<boolean> {
  DECOMMISSION_WARN(`permanentlyDeleteAction(${id})`);
  return false;
}

/**
 * Duplicate an action
 */
export async function duplicateAction(
  id: string,
  userId: string,
  newName?: string,
): Promise<PromptAction | null> {
  DECOMMISSION_WARN(`duplicateAction(${id}, ${userId}, ${newName})`);
  return null;
}

/**
 * Search actions by name or description
 */
export async function searchActions(
  query: string,
  userId: string,
): Promise<PromptAction[]> {
  DECOMMISSION_WARN(`searchActions(${query}, ${userId})`);
  void buildSearchOr; // keep import used for TS
  return [];
}
