export type ObservationStatus = "DRAFT" | "REVIEW" | "CONFIRMED" | "REJECTED";
export type EvidenceType = "PHOTO" | "AUDIO" | "TEXT";
export type FindingStatus = "DRAFT" | "CONFIRMED" | "REJECTED";

export interface Evidence {
  id: string;
  observation_id: string;
  type: EvidenceType;
  uri: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface Finding {
  id: string;
  observation_id: string;
  category: string;
  observation: string;
  issue: string;
  suggested_action: string;
  confidence: number | null;
  status: FindingStatus;
  created_at: string;
}

export interface Observation {
  id: string;
  title: string;
  text_note: string;
  status: ObservationStatus;
  created_at: string;
  evidence: Evidence[];
  findings: Finding[];
}

export interface ObservationCreate {
  title: string;
  text_note: string;
}

export interface CaptureLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface LocalCaptureEvidence {
  id: string;
  type: "PHOTO" | "AUDIO";
  name: string;
  mime_type: string;
  created_at: string;
  blob: Blob;
}

export interface LocalCapture {
  id: string;
  title: string;
  text_note: string;
  status: "DRAFT";
  created_at: string;
  location: CaptureLocation | null;
  evidence: LocalCaptureEvidence[];
  ai_extraction?: AIExtraction;
}

export interface SuggestedAction {
  title: string;
  description: string;
}

export interface AIDraftFinding {
  status: "AI_DRAFT";
  title: string;
  description: string;
  category: string;
  supporting_evidence: string[];
  reasoning: string;
  uncertainty: string;
  confidence: number | null;
  suggested_actions: SuggestedAction[];
  safety_concerns: string[];
}

export interface AIExtraction {
  capture_id: string;
  status: "AI_DRAFT";
  findings: AIDraftFinding[];
  limitations: string[];
  provider: string;
  model: string;
}
