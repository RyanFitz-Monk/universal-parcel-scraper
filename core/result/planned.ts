import { STAGES } from '../../generated/catalog.js';
import type { Stage } from '../status/index.js';
import { isRecord, type JsonObject } from '../types.js';
import type { CarrierEvent } from './index.js';

/**
 * A step a carrier wrote before it happened, which is no scan: in the words and at the clock the
 * carrier gives it, as `time` with its offset, or as a wall clock or a day in `local_time`.
 */
export interface PlannedEvent extends JsonObject {
  time?: string;
  local_time?: string;
  description: string;
  location?: string;
  /** The stage the step would mean once it happens. It sets nothing. */
  stage?: Stage;
}

/** At most this many steps are kept, the earliest first. */
export const MAX_PLANNED_EVENTS = 200;
const OFFSET_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const WALL_TIME = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)?$/;
const KNOWN_STAGES = new Set<string>(STAGES);

const text = (value: unknown, max: number) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : '';

/** A row held back from the scans as a planned step: its clock, its words, its place and its stage. */
export function plannedEvent(event: CarrierEvent): PlannedEvent | null {
  const description = text(event.description, 500);
  const clock = typeof event.time === 'string' && event.time ? { time: event.time }
    : typeof event.local_time === 'string' && event.local_time ? { local_time: event.local_time } : null;
  if (!description || !clock) return null;
  const location = text(event.location, 200);
  return { ...clock, description, ...(location ? { location } : {}),
    ...(typeof event.stage === 'string' && KNOWN_STAGES.has(event.stage) ? { stage: event.stage as Stage } : {}) };
}

/**
 * The steps of a reply that hold a description and a clock, each once, at most
 * `MAX_PLANNED_EVENTS`, the earliest first; anything else is dropped.
 */
export function plannedEvents(value: unknown): PlannedEvent[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const steps = value.flatMap((step): PlannedEvent[] => {
    if (!isRecord(step)) return [];
    const time = typeof step.time === 'string' && OFFSET_TIME.test(step.time) && Number.isFinite(Date.parse(step.time)) ? step.time : '';
    const local = !time && typeof step.local_time === 'string' && WALL_TIME.test(step.local_time) ? step.local_time : '';
    const planned = plannedEvent({ ...(time ? { time } : { local_time: local }), description: step.description,
      location: step.location, stage: step.stage } as CarrierEvent);
    if (!planned || !time && !local) return [];
    const key = JSON.stringify([planned.time, planned.local_time, planned.description, planned.location]);
    if (seen.has(key)) return [];
    seen.add(key);
    return [planned];
  });
  const at = (step: PlannedEvent) => step.time ? Date.parse(step.time) : Date.parse(`${step.local_time}${step.local_time!.length === 10 ? 'T00:00' : ''}Z`);
  return steps.map((step, index) => ({ step, index })).sort((a, b) => at(a.step) - at(b.step) || a.index - b.index)
    .map(({ step }) => step).slice(0, MAX_PLANNED_EVENTS);
}
