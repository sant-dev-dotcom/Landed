"use client";

import { useEffect, useState, type FormEvent } from "react";
import { MessageCircle, PenLine } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ios/Button";
import { ListRow } from "@/components/ios/ListRow";
import { ListSection } from "@/components/ios/ListSection";
import { SkeletonRow } from "@/components/ios/Spinner";
import { useToast } from "@/components/ios/Toast";
import { BODY_MAX, POSTS_PER_PAGE, TITLE_MAX, createPost, listPosts, timeAgo, type ForumPost } from "@/lib/forum";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** The Community forum on the Community tab: ask a question, see the newest posts. */
export function ForumSection() {
  const t = useTranslations("forum");
  const tc = useTranslations("common");
  const locale = useLocale();
  const toast = useToast();
  const [posts, setPosts] = useState<ForumPost[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  const load = () => {
    setFailed(false);
    setPosts(null);
    listPosts()
      .then((p) => {
        setPosts(p);
        setMore(p.length === POSTS_PER_PAGE);
      })
      .catch(() => setFailed(true));
  };

  useEffect(() => {
    if (isSupabaseConfigured()) load();
    else setFailed(true);
  }, []);

  const loadMore = async () => {
    if (!posts?.length || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await listPosts(posts[posts.length - 1].createdAt);
      setPosts([...posts, ...next]);
      setMore(next.length === POSTS_PER_PAGE);
    } catch {
      toast(tc("error"));
    } finally {
      setLoadingMore(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (posting || title.trim().length < 3) return;
    setPosting(true);
    try {
      const post = await createPost(title, body);
      setPosts((p) => [post, ...(p ?? [])]);
      setTitle("");
      setBody("");
      setComposing(false);
      toast(t("posted"));
    } catch {
      toast(tc("error"));
    } finally {
      setPosting(false);
    }
  };

  const meta = (p: ForumPost) =>
    [p.authorName ?? t("member"), timeAgo(p.createdAt, locale), t("replies", { count: p.replyCount })].join(" · ");

  return (
    <ListSection id="forum" header={t("title")} footer={t("footer")} bare>
      {composing ? (
        <form onSubmit={submit} className="list-section flex flex-col overflow-hidden rounded-cell bg-cell">
          <label className="relative flex flex-col px-4 pt-2">
            <span className="text-footnote text-secondary-label">{t("titleLabel")}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={TITLE_MAX}
              required
              autoFocus
              placeholder={t("titlePlaceholder")}
              className="min-h-[44px] bg-transparent text-body outline-none placeholder:text-tertiary-label"
            />
            <span className="absolute bottom-0 left-4 right-0 h-[0.5px] bg-separator" aria-hidden />
          </label>
          <label className="flex flex-col px-4 pt-2">
            <span className="text-footnote text-secondary-label">{t("bodyLabel")}</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={BODY_MAX}
              rows={4}
              placeholder={t("bodyPlaceholder")}
              className="resize-none bg-transparent py-2 text-body outline-none placeholder:text-tertiary-label"
            />
          </label>
          <p className="px-4 pb-1 text-footnote text-secondary-label">{t("privacyNote")}</p>
          <div className="flex gap-2.5 p-4 pt-2">
            <Button type="button" variant="tinted" size="medium" className="flex-1" onClick={() => setComposing(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" size="medium" className="flex-1" disabled={posting || title.trim().length < 3}>
              {t("post")}
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="tinted" icon={<PenLine size={18} strokeWidth={1.75} aria-hidden />} onClick={() => setComposing(true)} disabled={failed}>
          {t("ask")}
        </Button>
      )}

      <div className="list-section overflow-hidden rounded-cell bg-cell">
        {failed ? (
          <ListRow title={<span className="text-secondary-label">{t("unavailable")}</span>} />
        ) : posts === null ? (
          <div role="status" aria-label={tc("loading")}>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : posts.length === 0 ? (
          <ListRow title={<span className="text-secondary-label">{t("empty")}</span>} />
        ) : (
          posts.map((p) => (
            <ListRow
              key={p.id}
              href={`/social/forum?id=${encodeURIComponent(p.id)}`}
              icon={<MessageCircle />}
              iconColor="var(--lavender)"
              leadingTop
              title={p.title}
              subtitle={meta(p)}
            />
          ))
        )}
      </div>

      {more && (
        <Button variant="plain" size="medium" onClick={loadMore} disabled={loadingMore}>
          {t("showMore")}
        </Button>
      )}
    </ListSection>
  );
}
