"use client";

import { useState, type ReactNode } from "react";

export interface SettingsSection {
  id: string;
  label: string;
  content: ReactNode;
}

export default function SettingsShell({
  sections,
  initialActiveId,
}: {
  sections: SettingsSection[];
  initialActiveId: string;
}) {
  const [activeId, setActiveId] = useState(initialActiveId);
  const active = sections.find((s) => s.id === activeId) ?? sections[0];

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
      <nav className="flex shrink-0 flex-row gap-1 overflow-x-auto sm:w-48 sm:flex-col sm:overflow-visible">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveId(s.id)}
            className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
              s.id === active.id ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-panel-hover"
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1">{active.content}</div>
    </div>
  );
}
