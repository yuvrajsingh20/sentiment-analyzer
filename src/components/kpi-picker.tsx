"use client";

import { KPI_CATALOG, KPI_GROUP_LABEL, KPI_PRESETS, type KpiGroupId } from "@/lib/kpi-catalog";

const GROUPS: KpiGroupId[] = ["customer", "agent", "company", "conversation"];

export function KpiPicker({
  selected,
  custom,
  onSelectedChange,
  onCustomChange,
  disabled,
}: {
  selected: string[];
  custom: string;
  onSelectedChange: (ids: string[]) => void;
  onCustomChange: (value: string) => void;
  disabled?: boolean;
}) {
  const set = new Set(selected);

  function toggle(id: string) {
    if (set.has(id)) onSelectedChange(selected.filter((x) => x !== id));
    else onSelectedChange([...selected, id]);
  }

  return (
    <div className="card mt-6 px-6 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">KPI brief</p>
          <p className="type-body-sm text-[var(--ink-2)]">
            Pick what Gemini should score. Unchecked tiles are abstained.
          </p>
        </div>
        <p className="type-caption text-[var(--ink-3)]">
          {selected.length} selected
          {custom.trim() ? " · custom added" : ""}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {KPI_PRESETS.map((preset) => {
          const active =
            preset.ids.length === selected.length &&
            preset.ids.every((id) => set.has(id));
          return (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelectedChange(preset.ids)}
              className={`rounded-[8px] px-3 py-1.5 text-[12px] font-medium transition-colors ${
                active
                  ? "bg-[var(--ink-1)] text-[var(--surface-0)]"
                  : "bg-[var(--surface-2)] text-[var(--ink-2)] hover:text-[var(--ink-1)]"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {GROUPS.map((group) => (
          <fieldset key={group} disabled={disabled} className="min-w-0">
            <legend className="eyebrow mb-2 text-[var(--ink-1)]">
              {KPI_GROUP_LABEL[group]}
            </legend>
            <div className="space-y-1.5">
              {KPI_CATALOG.filter((k) => k.group === group).map((kpi) => {
                const on = set.has(kpi.id);
                return (
                  <label
                    key={kpi.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-[8px] px-1 py-0.5 text-[13px] text-[var(--ink-2)] hover:text-[var(--ink-1)]"
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(kpi.id)}
                      className="h-3.5 w-3.5 accent-[var(--ink-1)]"
                    />
                    {kpi.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <label className="mt-5 block">
        <span className="eyebrow text-[var(--ink-1)]">Your own KPIs</span>
        <textarea
          value={custom}
          disabled={disabled}
          onChange={(e) => onCustomChange(e.target.value)}
          rows={2}
          placeholder="One per line — e.g. Wait time mentioned, Refund fairness"
          className="field mt-2 text-[13px] leading-relaxed"
        />
      </label>
    </div>
  );
}
