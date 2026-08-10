import type { Language } from "./i18n";

function formatClockDuration(milliseconds: number) {
  const totalTenths = Math.max(0, Math.round(milliseconds / 100));
  const minutes = Math.floor(totalTenths / 600);
  const seconds = (totalTenths % 600) / 10;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

export function formatTerminatedExposureSummary(
  actualDurationMs: number,
  plannedDurationMs: number,
  language: Language,
) {
  if (plannedDurationMs <= 0) {
    return language === "zh"
      ? "无屏幕暴露（旧版正常睡眠对照）"
      : "No screen exposure (legacy normal-sleep control)";
  }

  const percentage = Math.max(0, actualDurationMs) / plannedDurationMs * 100;
  const duration = `${formatClockDuration(actualDurationMs)} / ${formatClockDuration(plannedDurationMs)}`;

  return language === "zh"
    ? `有效暴露 ${duration}（${percentage.toFixed(1)}%；不含暂停）`
    : `Active exposure ${duration} (${percentage.toFixed(1)}%; pauses excluded)`;
}
