"use client";

export type Tag = "UNTAGGED" | "MINE" | "FAKE" | "IGNORE";

export interface ReportInfo {
  platform: string;
  url: string;
  note: string;
}

const TAG_STYLE: Record<string, string> = {
  MINE: "bg-emerald-600 text-white border-emerald-600",
  FAKE: "bg-red-600 text-white border-red-600",
  IGNORE: "bg-slate-500 text-white border-slate-500",
};
const TAG_LABEL = { MINE: "Mine", FAKE: "Fake", IGNORE: "Ignore" } as const;

export function TagButtons({ tag, onTag }: { tag: Tag; onTag: (next: Tag) => void }) {
  return (
    <div className="flex shrink-0 gap-1">
      {(["MINE", "FAKE", "IGNORE"] as const).map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => onTag(tag === name ? "UNTAGGED" : name)}
          className={`rounded-md border px-2 py-1 text-xs font-medium ${
            tag === name ? TAG_STYLE[name] : "border-slate-300 text-slate-700"
          }`}
        >
          {TAG_LABEL[name]}
        </button>
      ))}
    </div>
  );
}

/** Shown under a result tagged Fake: where to report it. */
export function ReportBox({ report, fallbacks }: { report: ReportInfo | null; fallbacks: ReportInfo[] }) {
  const links = report ? [report] : fallbacks;
  return (
    <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-900">
      <div className="font-medium">
        {report ? `Report this to ${report.platform}` : "This site is not on our list. Ways to get it removed:"}
      </div>
      <ul className="mt-1 space-y-1">
        {links.map((link) => (
          <li key={link.url}>
            <a href={link.url} target="_blank" rel="noopener noreferrer" className="font-medium underline">
              {report ? "Open the official report page" : link.platform}
            </a>
            <span className="text-red-800"> — {link.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
