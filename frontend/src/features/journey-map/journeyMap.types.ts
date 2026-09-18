import type { LonLat } from "./stationFootprints.build";
import type { CrowdReading, MapLineCode } from "./geometryContract";

export type { LonLat };
export type LegMode = "walk" | "rail" | "bus";

/**
 * How a leg's line was obtained. Only "routed" follows real streets; the
 * others are approximations the map must label as such.
 *  - routed: path supplied by an OSM/OneMap routing engine
 *  - network-topology: rail drawn station-to-station, not surveyed track
 *  - straight-line: a direct line between the leg's ends
 *  - unavailable: nothing trustworthy to draw
 */
export type GeometrySource = "routed" | "network-topology" | "straight-line" | "unavailable";

export interface MapPoint {
  label: string;
  coordinates: LonLat | null;
}

export interface MapSegment {
  fromStationId: string;
  toStationId: string;
  path: [LonLat, LonLat];
  /** Events whose affected stretch covers this station pair. */
  affectedEventIds: string[];
}

export interface MapLeg {
  index: number;
  mode: LegMode;
  instruction: string;
  minutes: number | null;
  lineCode: MapLineCode | null;
  /** Rail only: every station passed, in travel order. */
  stationIds: string[];
  /** Rail only: one entry per station pair, for affected/unaffected styling. */
  segments: MapSegment[];
  path: LonLat[] | null;
  geometrySource: GeometrySource;
  /** Events affecting any part of this leg. */
  affectedEventIds: string[];
}

export type CandidateRole = "original" | "recommended" | "other";

export interface MapCandidate {
  id: string;
  label: string;
  role: CandidateRole;
  /** Estimated arrival; null when the source gives a duration only. */
  arrivalAt: string | null;
  arrivalRange: { earliest: string; latest: string } | null;
  /** Door-to-door minutes when known. */
  durationMinutes: number | null;
  /** Total walking minutes stated by the source, when known. */
  walkingMinutes: number | null;
  legs: MapLeg[];
}

export interface MapEvent {
  id: string;
  kind: "planned" | "unplanned";
  title: string;
  lineCode: MapLineCode | null;
  /** Stations inside the affected stretch, in line order; empty when not located. */
  stationIds: string[];
  delayMinutes: number | null;
}

export interface MapDataState {
  mode: "demo" | "live";
  observedAt: string;
  /** Earliest moment any contributing source becomes stale. */
  staleAt: string;
  simulated: boolean;
}

/** Words for the two roles; they differ between Rachel's scenario and a route planner. */
export interface RoleLabels {
  /** For example "Recommended" or "Selected". */
  recommended: string;
  /** For example "Usual" or "Option 1". */
  original: string;
  /** Completes "N min earlier than …", for example "usual". */
  comparedWith: string;
}

/** Everything the Journey Map draws. Built from the shared snapshot; never fetched by the map. */
export interface JourneyMapModel {
  origin: MapPoint;
  destination: MapPoint;
  candidates: MapCandidate[];
  originalCandidateId: string;
  recommendedCandidateId: string;
  labels: RoleLabels;
  events: MapEvent[];
  crowd: CrowdReading[];
  dataState: MapDataState;
  /** Developer-facing notes about ignored or approximated input. */
  warnings: string[];
}
