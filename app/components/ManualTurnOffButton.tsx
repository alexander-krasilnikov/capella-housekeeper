"use client";

import ManualPowerButton from "./ManualPowerButton";

export default function ManualTurnOffButton(props: {
  clusterId: string;
  clusterName: string;
  disabled?: boolean;
  /** Result is reported upward rather than replacing this button in place - see ClusterTable's Action cell, which renders it in one shared footer below the whole row of buttons. */
  onResult: (result: { ok: boolean; message: string } | null) => void;
}) {
  return <ManualPowerButton direction="off" {...props} />;
}
