import { Clock } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";

export interface ActivityEntry {
  id: string;
  caseId: number;
  message: string;
  createdBy: string;
  createdAt: string;
  caseName: string | null;
}

interface RecentActivityFeedProps {
  activities: ActivityEntry[];
  dark: boolean;
  t: ReturnType<typeof themeClasses>;
}

export function RecentActivityFeed({ activities, dark, t }: RecentActivityFeedProps) {
  return (
    <div className={`rounded-xl border ${t.card} p-4`}>
      <h4 className={`text-xs font-bold ${t.text} flex items-center gap-2 mb-3`}>
        <Clock aria-hidden="true" className="h-3.5 w-3.5" /> Recent Activity
        <span className={`text-[10px] font-normal ${t.textMuted}`}>
          ({activities.length})
        </span>
      </h4>
      <div className="space-y-2.5 max-h-70 overflow-y-auto pr-1">
        {activities.length === 0 ? (
          <p className={`text-xs ${t.textMuted} text-center py-6`}>
            No recent activity.
          </p>
        ) : (
          activities.slice(0, 20).map((a) => (
            <div
              key={a.id}
              className={`rounded-md p-2 ${dark ? "bg-neutral-800/40" : "bg-neutral-50"}`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-semibold ${t.text}`}>
                  {a.createdBy}
                </span>
                {a.caseName && (
                  <span className={`text-[10px] ${t.textMuted}`}>
                    on {a.caseName}
                  </span>
                )}
              </div>
              <p className={`text-[11px] ${t.textSub} mt-0.5 leading-snug line-clamp-2`}>
                {a.message}
              </p>
              <p className={`text-[9px] ${t.textMuted} mt-0.5`}>
                {new Date(a.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
