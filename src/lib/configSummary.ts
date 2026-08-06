import type { ClusterConfig } from "../types";

export function formatConfigSummary(clusterConfig: ClusterConfig): string {
  const { nodeCount, nodeSpec, cloudProvider, region } = clusterConfig;
  const { cpu, ram } = nodeSpec.compute;
  return `${nodeCount}× ${cpu}vCPU/${ram}GB, ${cloudProvider}/${region}`;
}

/** Formats a raw API status string (e.g. "turnedOff") into a readable label ("Turned Off"). */
export function formatStatusLabel(status: string | null): string {
  if (!status) return "Active";
  const spaced = status.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}
