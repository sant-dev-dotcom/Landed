"use client";

import { useRef, useState } from "react";
import { Camera, FileText, Image as ImageIcon, ImageOff, Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { BarButton, Sheet } from "./ios/Sheet";
import { Button } from "./ios/Button";
import { ListSection } from "./ios/ListSection";
import { ListRow } from "./ios/ListRow";
import { LoadingBlock } from "./ios/Spinner";
import { ScanResultView } from "./ScanResult";
import { demoLetterSvg, SAMPLE_IDS, type SampleId } from "@/lib/demoLetters";
import { fileToJpeg, postJSON, svgToJpeg } from "@/lib/client";
import { paintRedactions, scanForPrivateDetails, type RedactionScan } from "@/lib/redact";
import type { Box } from "@/lib/redactRules";
import type { QualityIssue } from "@/lib/imageQuality";
import { useProfile } from "@/lib/hooks";
import type { ScanResult } from "@/lib/types";
import { ProgressBar } from "./ios/ProgressBar";
import { RedactReview } from "./RedactReview";

type State =
  | { kind: "idle"; showSamples?: boolean }
  | { kind: "protecting"; progress: number }
  | { kind: "review"; image: string; scan: RedactionScan; sampleId?: SampleId }
  | { kind: "rejected"; issue: QualityIssue }
  | { kind: "reading" }
  | { kind: "result"; result: ScanResult; sample?: boolean }
  | { kind: "error"; message: string };

export function ScanSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("scan");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [profile] = useProfile();
  // Preview of the image while it is being read. Cleared as soon as the result arrives.
  const [preview, setPreview] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 1. Cover private details on the device, then let the person check the result.
  const run = async (getImage: () => Promise<string>, sampleId?: SampleId) => {
    setState({ kind: "protecting", progress: 0 });
    try {
      const image = await getImage();
      const names = profile?.name ? [profile.name] : [];
      const scan = await scanForPrivateDetails(image, names, (progress) =>
        setState((s) => (s.kind === "protecting" ? { kind: "protecting", progress } : s))
      );
      // Unclear photos are turned away here: nothing is sent and the image is dropped.
      setState(scan.quality ? { kind: "rejected", issue: scan.quality } : { kind: "review", image, scan, sampleId });
    } catch {
      setState({ kind: "error", message: tc("error") });
    } finally {
      if (cameraRef.current) cameraRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // 2. Only the covered copy is sent to be read.
  const send = async (image: string, boxes: Box[], sampleId?: SampleId) => {
    setState({ kind: "reading" });
    let covered: string | null = null;
    try {
      covered = await paintRedactions(image, boxes);
      setPreview(covered);
      const data = await postJSON<{ result: ScanResult; sample?: boolean }>("/api/scan", {
        image: covered,
        mimeType: "image/jpeg",
        locale,
        sampleId,
      });
      setState({ kind: "result", result: data.result, sample: data.sample });
    } catch (err) {
      const code = (err as { code?: string }).code;
      setState({
        kind: "error",
        message: code === "too_large" ? t("tooBig") : code === "not_configured" ? t("notConfigured") : tc("error"),
      });
    } finally {
      // Drop every reference to the image. Nothing is written to storage.
      covered = null;
      setPreview(null);
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) run(() => fileToJpeg(file));
  };

  const close = () => {
    onClose();
    setTimeout(() => setState({ kind: "idle" }), 400);
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={t("title")}
      detent="large"
      trailing={
        <BarButton bold onClick={close}>
          {tc("done")}
        </BarButton>
      }
    >
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} tabIndex={-1} aria-hidden />
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} tabIndex={-1} aria-hidden />

      {state.kind === "idle" && (
        <div className="flex flex-col gap-7 px-5 pb-8 pt-4">
          <div className="flex flex-col items-center gap-4 px-2 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-tile bg-cell">
              <FileText size={32} strokeWidth={1.75} className="text-sage" aria-hidden />
            </span>
            <p className="text-headline text-label-soft">{t("intro")}</p>
          </div>
          <div className="space-y-3">
            <Button icon={<Camera size={20} strokeWidth={1.75} aria-hidden />} onClick={() => cameraRef.current?.click()}>
              {t("takePhoto")}
            </Button>
            <Button variant="tinted" icon={<ImageIcon size={20} strokeWidth={1.75} aria-hidden />} onClick={() => fileRef.current?.click()}>
              {t("choosePhoto")}
            </Button>
            <Button
              variant="plain"
              size="large"
              onClick={() => setState({ kind: "idle", showSamples: !state.showSamples })}
              aria-expanded={Boolean(state.showSamples)}
            >
              {t("trySample")}
            </Button>
          </div>
          {state.showSamples && (
            <ListSection header={t("samplesTitle")} footer={t("samplesFooter")}>
              {SAMPLE_IDS.map((id, i) => (
                <ListRow
                  key={id}
                  icon={<FileText size={18} strokeWidth={2} />}
                  iconColor={["var(--sage)", "var(--clay)", "var(--oat)"][i]}
                  title={t(`sample${i + 1}` as "sample1")}
                  onClick={() => run(() => svgToJpeg(demoLetterSvg(id)), id)}
                  chevron
                />
              ))}
            </ListSection>
          )}
          <p className="flex items-start gap-2 px-1 text-footnote text-secondary-label">
            <Lock size={14} strokeWidth={1.75} className="mt-1 shrink-0" aria-hidden />
            {t("privacy")}
          </p>
        </div>
      )}

      {state.kind === "protecting" && (
        <div className="flex flex-col items-center gap-4 px-8 pt-10">
          <LoadingBlock text={t("protecting")} />
          <div className="w-full max-w-[240px]">
            <ProgressBar value={state.progress} label={t("protecting")} />
          </div>
          <p className="text-center text-footnote text-secondary-label">{t("protectingNote")}</p>
        </div>
      )}

      {state.kind === "rejected" && (
        <div className="flex flex-col gap-6 px-5 pb-8 pt-4" role="alert">
          <div className="flex flex-col gap-3 rounded-status bg-orange-tint p-5">
            <div className="flex items-center gap-3">
              <ImageOff size={22} strokeWidth={1.75} className="shrink-0 text-oat" aria-hidden />
              <p className="text-[1.3125rem] leading-snug">{t(`rejected_${state.issue}`)}</p>
            </div>
            <p className="text-body text-label-soft">{t("rejectedBody")}</p>
          </div>
          <ListSection header={t("tipsTitle")}>
            {(["tip1", "tip2", "tip3", "tip4"] as const).map((k) => (
              <ListRow key={k} title={t(k)} />
            ))}
          </ListSection>
          <div className="flex flex-col gap-2.5">
            <Button icon={<Camera size={20} strokeWidth={1.75} aria-hidden />} onClick={() => cameraRef.current?.click()}>
              {t("retake")}
            </Button>
            <Button variant="tinted" icon={<ImageIcon size={20} strokeWidth={1.75} aria-hidden />} onClick={() => fileRef.current?.click()}>
              {t("chooseAnother")}
            </Button>
          </div>
        </div>
      )}

      {state.kind === "review" && (
        <RedactReview
          image={state.image}
          scan={state.scan}
          onSend={(boxes) => send(state.image, boxes, state.sampleId)}
          onCancel={() => setState({ kind: "idle" })}
        />
      )}

      {state.kind === "reading" && (
        <div className="flex flex-col items-center px-4 pt-6">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-56 w-auto rounded-tile border border-separator object-contain opacity-80" />
          )}
          <LoadingBlock text={t("reading")} />
        </div>
      )}

      {state.kind === "result" && (
        <ScanResultView result={state.result} sample={state.sample} onAgain={() => setState({ kind: "idle" })} />
      )}

      {state.kind === "error" && (
        <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
          <p className="text-body text-label-soft">{state.message}</p>
          <Button size="medium" onClick={() => setState({ kind: "idle", showSamples: true })}>
            {tc("retry")}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
