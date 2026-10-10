import type { ObservationStatus } from "../types";

const labels: Record<ObservationStatus, string> = {
  DRAFT: "Draft",
  REVIEW: "Review",
  CONFIRMED: "Confirmed",
  REJECTED: "Rejected",
};

export default function StatusBadge({ status }: { status: ObservationStatus }) {
  return <span className={`status-badge status-${status.toLowerCase()}`}>{labels[status]}</span>;
}
