"use client";

import { KPI_CATALOG, KPI_GROUP_LABEL, KPI_PRESETS, type KpiGroupId } from "@/lib/kpi-catalog";
import type { SubscriptionPlan } from "@/lib/users";

const GROUPS: KpiGroupId[] = ["customer", "agent", "company", "conversation"];

export function KpiPicker({
  selected,
  custom,
  onSelectedChange,
  onCustomChange,
  disabled,
  plan,
  allowedKpis,
  onUpgradeClick,
}: {
  selected: string[];
  custom: string;
  onSelectedChange: (ids: string[]) => void;
  onCustomChange: (value: string) => void;
  disabled?: boolean;
  plan?: SubscriptionPlan;
  allowedKpis?: string[] | null;
  onUpgradeClick?: () => void;
}) {
  const set = new Set(selected);
  const allowed = allowedKpis ? new Set(allowedKpis) : null;

  function toggle(id: string) {
    if (allowed && !allowed.has(id)) {
      onUpgradeClick?.();
      return;
    }
    if (set.has(id)) onSelectedChange(selected.filter((x) => x !== id));
    else onSelectedChange([...selected, id]);
  }

  function applyPreset(ids: string[]) {
    if (allowed) {
      onSelectedChange(ids.filter((id) => allowed.has(id)));
    } else {
      onSelectedChange(ids);
    }
  }

  return (
    <div className="card mt-6 px-5 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">KPI brief</p>
          <p className="type-body-sm text-[var(--ink-2)]">
            Select KPIs to evaluate. Unchecked metrics are abstained.
          </p>
        </div>
        <p className="type-caption text-[var(--ink-3)]">
          {selected.length} selected
          {custom.trim() ? " · custom added" : ""}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {KPI_PRESETS.map((preset) => {
          const effectiveIds = allowed ? preset.ids.filter((id) => allowed.has(id)) : preset.ids;
          const active =
            effectiveIds.length === selected.length &&
            effectiveIds.every((id) => set.has(id));
          return (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              onClick={() => applyPreset(preset.ids)}
              className={`rounded-[8px] px-3 py-1.5 text-[12px] font-medium transition-colors ${
                active
                  ? "bg-[var(--ink-1)] text-[var(--plane)]"
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
                const locked = allowed !== null && !allowed.has(kpi.id);
                return (
                  <label
                    key={kpi.id}
                    onClick={locked ? (e) => { e.preventDefault(); onUpgradeClick?.(); } : undefined}
                    className={`flex items-center gap-2.5 rounded-[8px] px-1 py-0.5 text-[13px] ${
                      locked
                        ? "cursor-pointer text-[var(--ink-3)] opacity-60"
                        : "cursor-pointer text-[var(--ink-2)] hover:text-[var(--ink-1)]"
                    }`}
                  >
                    {locked ? (
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]" fill="currentColor">
                        <path d="M8 1a4 4 0 00-4 4v3H3a1 1 0 00-1 1v5a1 1 0 001 1h10a1 1 0 001-1V9a1 1 0 00-1-1h-1V5a4 4 0 00-4-4zm2 7V5a2 2 0 10-4 0v3h4z" />
                      </svg>
                    ) : (
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(kpi.id)}
                        className="h-3.5 w-3.5 accent-[var(--ink-1)]"
                      />
                    )}
                    {kpi.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <label className="mt-5 block relative">
        <span className="eyebrow text-[var(--ink-1)]">
          Your own KPIs
          {plan && plan !== "pro" && (
            <span className="ml-2 inline-flex items-center gap-1 rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--ink-3)]">
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor">
                <path d="M8 1a4 4 0 00-4 4v3H3a1 1 0 00-1 1v5a1 1 0 001 1h10a1 1 0 001-1V9a1 1 0 00-1-1h-1V5a4 4 0 00-4-4zm2 7V5a2 2 0 10-4 0v3h4z" />
              </svg>
              Pro only
            </span>
          )}
        </span>
        {plan && plan !== "pro" ? (
          <div
            onClick={onUpgradeClick}
            className="mt-2 flex h-[68px] cursor-pointer items-center justify-center rounded-[8px] border border-dashed border-[var(--hairline)] bg-[var(--surface-1)] text-[13px] text-[var(--ink-3)] hover:border-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
          >
            Upgrade to Pro to add custom KPIs
          </div>
        ) : (
          <textarea
            value={custom}
            disabled={disabled}
            onChange={(e) => onCustomChange(e.target.value)}
            rows={2}
            placeholder="One per line — e.g. Wait time mentioned, Refund fairness"
            className="field mt-2 text-[13px] leading-relaxed"
          />
        )}
      </label>
    </div>
  );
}
