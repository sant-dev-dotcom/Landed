"use client";

import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { ButtonLink } from "./ios/Button";
import { AiLabel } from "./Disclaimer";
import { WarningIcon } from "./LampIcons";
import { Markdown } from "./Markdown";
import { ReadAloud } from "./ReadAloud";
import { useOpenLink } from "./browser/InAppBrowser";
import type { GroundedAnswer } from "@/lib/types";

export function AnswerWithSources({ answer }: { answer: GroundedAnswer }) {
  const t = useTranslations("ask");
  const tc = useTranslations("common");
  const openLink = useOpenLink();
  return (
    <div className="flex max-w-[88%] flex-col items-start gap-2">
      {answer.isCaseSpecific && (
        <p className="flex items-center gap-1.5 pl-1 text-footnote text-oat">
          <WarningIcon size={15} />
          {t("caseSpecific")}
        </p>
      )}
      <div className="rounded-cell rounded-bl-[6px] bg-cell px-4 py-3">
        <Markdown
          text={answer.answer}
          renderLink={(text, url, key) =>
            /^https:\/\//.test(url) ? (
              <button key={key} type="button" onClick={() => openLink(url)} className="text-tint underline decoration-1 underline-offset-2">
                {text}
              </button>
            ) : (
              <span key={key}>{text}</span>
            )
          }
        />
      </div>
      {answer.sources.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 pl-1" aria-label={tc("sources")}>
          {answer.sources.map((s) => (
            <li key={s.url}>
              <button
                type="button"
                onClick={() => openLink(s.url)}
                aria-label={tc("openSource", { name: s.title })}
                className="pressable inline-flex min-h-[32px] max-w-[260px] items-center gap-1 rounded-full border border-separator px-3 py-1 text-footnote text-tint"
              >
                <span className="truncate">{s.title}</span>
                <ExternalLink size={12} strokeWidth={1.75} className="shrink-0" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {answer.redirectToHelp && (
        <ButtonLink href="/legal/help" size="medium" className="mt-1">
          {t("findHelp")}
        </ButtonLink>
      )}
      <ReadAloud text={answer.answer} />
      <div className="pl-1">
        <AiLabel />
      </div>
    </div>
  );
}
