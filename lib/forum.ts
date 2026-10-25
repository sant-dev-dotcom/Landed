"use client";

import { intlTag } from "@/i18n/languages";
import { maskIds } from "./mask";
import { getProfile } from "./storage";
import { supabase } from "./supabase/client";

// The Community forum: questions anyone signed in to Landed can read and answer.
// Tables and access rules: supabase/migrations/*_forum.sql.

export const TITLE_MAX = 120;
export const BODY_MAX = 2000;
export const POSTS_PER_PAGE = 10;

export interface ForumPost {
  id: string;
  authorId: string;
  authorName: string | null;
  title: string;
  body: string;
  createdAt: string;
  replyCount: number;
}

export interface ForumReply {
  id: string;
  authorId: string;
  authorName: string | null;
  body: string;
  createdAt: string;
}

interface PostRow {
  id: string;
  author_id: string;
  author_name: string | null;
  title: string;
  body: string;
  created_at: string;
  forum_replies?: { count: number }[];
}

type ReplyRow = Omit<PostRow, "title" | "forum_replies">;

const POST_COLUMNS = "id, author_id, author_name, title, body, created_at, forum_replies(count)";

const toPost = (r: PostRow): ForumPost => ({
  id: r.id,
  authorId: r.author_id,
  authorName: r.author_name,
  title: r.title,
  body: r.body,
  createdAt: r.created_at,
  replyCount: r.forum_replies?.[0]?.count ?? 0,
});

const toReply = (r: ReplyRow): ForumReply => ({
  id: r.id,
  authorId: r.author_id,
  authorName: r.author_name,
  body: r.body,
  createdAt: r.created_at,
});

// Posts are public to everyone in Landed: only a first name is shown, and anything that
// looks like an A-number or receipt number is masked before it leaves the device.
const clean = (text: string, max: number) => maskIds(text.trim()).slice(0, max);

async function authorName() {
  const name = (await getProfile())?.name?.trim().split(/\s+/)[0];
  return name ? name.slice(0, 40) : null;
}

/** Newest first. `before` is the createdAt of the last post already shown. */
export async function listPosts(before?: string): Promise<ForumPost[]> {
  let q = supabase().from("forum_posts").select(POST_COLUMNS).order("created_at", { ascending: false }).limit(POSTS_PER_PAGE);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q.returns<PostRow[]>();
  if (error) throw error;
  return (data ?? []).map(toPost);
}

export async function getPost(id: string): Promise<ForumPost | null> {
  const { data, error } = await supabase().from("forum_posts").select(POST_COLUMNS).eq("id", id).maybeSingle<PostRow>();
  if (error) throw error;
  return data ? toPost(data) : null;
}

export async function listReplies(postId: string): Promise<ForumReply[]> {
  const { data, error } = await supabase()
    .from("forum_replies")
    .select("id, author_id, author_name, body, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .returns<ReplyRow[]>();
  if (error) throw error;
  return (data ?? []).map(toReply);
}

export async function createPost(title: string, body: string): Promise<ForumPost> {
  const { data, error } = await supabase()
    .from("forum_posts")
    .insert({ title: clean(title, TITLE_MAX), body: clean(body, BODY_MAX), author_name: await authorName() })
    .select(POST_COLUMNS)
    .single<PostRow>();
  if (error) throw error;
  return toPost(data);
}

export async function createReply(postId: string, body: string): Promise<ForumReply> {
  const { data, error } = await supabase()
    .from("forum_replies")
    .insert({ post_id: postId, body: clean(body, BODY_MAX), author_name: await authorName() })
    .select("id, author_id, author_name, body, created_at")
    .single<ReplyRow>();
  if (error) throw error;
  return toReply(data);
}

export async function deletePost(id: string) {
  const { error } = await supabase().from("forum_posts").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteReply(id: string) {
  const { error } = await supabase().from("forum_replies").delete().eq("id", id);
  if (error) throw error;
}

/** The signed-in account's id, to show Delete on their own posts. */
export async function currentUserId() {
  const { data } = await supabase().auth.getSession();
  return data.session?.user.id ?? null;
}

/** "3 hours ago", "yesterday", in the app's language. */
export function timeAgo(iso: string, locale: string) {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(intlTag(locale), { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  return rtf.format(0, "minute");
}
