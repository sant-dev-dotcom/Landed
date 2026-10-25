"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Alert } from "@/components/ios/Alert";
import { Button } from "@/components/ios/Button";
import { Card } from "@/components/ios/Card";
import { GroupedList } from "@/components/ios/GroupedList";
import { ListSection } from "@/components/ios/ListSection";
import { NavBar } from "@/components/ios/NavBar";
import { Screen } from "@/components/ios/Screen";
import { SkeletonRow } from "@/components/ios/Spinner";
import { useToast } from "@/components/ios/Toast";
import {
  BODY_MAX,
  createReply,
  currentUserId,
  deletePost,
  deleteReply,
  getPost,
  listReplies,
  timeAgo,
  type ForumPost,
  type ForumReply,
} from "@/lib/forum";

export default function ForumThreadPage() {
  return (
    <Suspense>
      <Thread />
    </Suspense>
  );
}

function Thread() {
  const t = useTranslations("forum");
  const tc = useTranslations("common");
  const tm = useTranslations("community");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const id = useSearchParams().get("id") || "";
  const [post, setPost] = useState<ForumPost | null | undefined>(undefined);
  const [replies, setReplies] = useState<ForumReply[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  // What the person asked to delete: the post itself, or one of their replies.
  const [confirm, setConfirm] = useState<{ kind: "post" } | { kind: "reply"; id: string } | null>(null);

  useEffect(() => {
    currentUserId().then(setMe);
    getPost(id)
      .then(setPost)
      .catch(() => setPost(null));
    listReplies(id)
      .then(setReplies)
      .catch(() => setReplies([]));
  }, [id]);

  const back = { href: "/social", label: tm("title") };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (sending || !reply.trim()) return;
    setSending(true);
    try {
      const r = await createReply(id, reply);
      setReplies((list) => [...(list ?? []), r]);
      setReply("");
    } catch {
      toast(tc("error"));
    } finally {
      setSending(false);
    }
  };

  const remove = async () => {
    const target = confirm;
    setConfirm(null);
    if (!target) return;
    try {
      if (target.kind === "post") {
        await deletePost(id);
        toast(t("deleted"));
        router.replace("/social");
      } else {
        await deleteReply(target.id);
        setReplies((list) => list?.filter((r) => r.id !== target.id) ?? null);
      }
    } catch {
      toast(tc("error"));
    }
  };

  const byline = (name: string | null, at: string) => `${name ?? t("member")} · ${timeAgo(at, locale)}`;

  if (post === undefined) {
    return (
      <Screen push>
        <NavBar title={t("title")} back={back} />
        <GroupedList>
          <SkeletonRow />
        </GroupedList>
      </Screen>
    );
  }
  if (post === null) {
    return (
      <Screen push>
        <NavBar title={t("title")} back={back} />
        <p className="px-5 py-12 text-center text-body text-secondary-label">{t("notFound")}</p>
      </Screen>
    );
  }

  return (
    <Screen push>
      <NavBar title={t("title")} back={back} />
      <GroupedList>
        <Card className="flex flex-col gap-2 p-[18px]">
          <h2 className="text-title3">{post.title}</h2>
          {post.body && <p className="whitespace-pre-line text-body text-label-soft">{post.body}</p>}
          <div className="flex items-center justify-between gap-2">
            <p className="text-footnote text-secondary-label">{byline(post.authorName, post.createdAt)}</p>
            {me === post.authorId && (
              <button
                type="button"
                onClick={() => setConfirm({ kind: "post" })}
                className="pressable flex h-11 w-11 items-center justify-center text-secondary-label"
                aria-label={t("deletePost")}
              >
                <Trash2 size={18} strokeWidth={1.75} aria-hidden />
              </button>
            )}
          </div>
        </Card>

        <ListSection id="replies" header={t("repliesTitle")} footer={t("footer")} bare>
          {replies === null ? (
            <SkeletonRow />
          ) : replies.length === 0 ? (
            <p className="px-1 text-subheadline text-secondary-label">{t("noReplies")}</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {replies.map((r) => (
                <Card key={r.id} className="flex flex-col gap-1.5 p-[18px]">
                  <p className="whitespace-pre-line text-body">{r.body}</p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-footnote text-secondary-label">{byline(r.authorName, r.createdAt)}</p>
                    {me === r.authorId && (
                      <button
                        type="button"
                        onClick={() => setConfirm({ kind: "reply", id: r.id })}
                        className="pressable flex h-11 w-11 items-center justify-center text-secondary-label"
                        aria-label={t("deleteReply")}
                      >
                        <Trash2 size={18} strokeWidth={1.75} aria-hidden />
                      </button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          <form onSubmit={send} className="list-section flex flex-col overflow-hidden rounded-cell bg-cell">
            <label className="flex flex-col px-4 pt-2">
              <span className="text-footnote text-secondary-label">{t("replyLabel")}</span>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                maxLength={BODY_MAX}
                rows={3}
                placeholder={t("replyPlaceholder")}
                className="resize-none bg-transparent py-2 text-body outline-none placeholder:text-tertiary-label"
              />
            </label>
            <div className="p-4 pt-1">
              <Button type="submit" size="medium" className="w-full" disabled={sending || !reply.trim()}>
                {t("sendReply")}
              </Button>
            </div>
          </form>
        </ListSection>
      </GroupedList>

      <Alert
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === "post" ? t("deletePostTitle") : t("deleteReplyTitle")}
        actions={[
          { label: tc("cancel"), style: "cancel", onPress: () => setConfirm(null) },
          { label: tc("delete"), style: "destructive", onPress: remove },
        ]}
      />
    </Screen>
  );
}
