'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Bookmark, BookmarkCheck, Heart, MessageCircle, Repeat2, Share2, Trash2, X } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Post {
  id: string;
  text: string;
  image?: string;
  likes: number;
  replies_count: number;
  reposts_count: number;
  created_at: string;
  user_id: string;
  users: {
    id: string;
    username: string;
    avatar_url?: string;
    display_name?: string;
  };
}

interface BookmarkedPost {
  id: string;
  created_at: string;
  post_id: string;
  posts: Post;
}

export default function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState<BookmarkedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, []);

  // Fetch bookmarks
  const fetchBookmarks = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('bookmarks')
      .select(`
        id,
        created_at,
        post_id,
        posts (
          id,
          text,
          image,
          likes,
          replies_count,
          reposts_count,
          created_at,
          user_id,
          users (
            id,
            username,
            avatar_url,
            display_name
          )
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setBookmarks(data as unknown as BookmarkedPost[]);
    }
    setLoading(false);
  }, [userId]);

  // Fetch liked posts
  const fetchLikedPosts = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('likes')
      .select('post_id')
      .eq('user_id', userId);
    if (data) {
      setLikedPosts(new Set(data.map((l) => l.post_id)));
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchBookmarks();
      fetchLikedPosts();
    }
  }, [userId, fetchBookmarks, fetchLikedPosts]);

  // Remove bookmark
  const removeBookmark = async (bookmarkId: string, postId: string) => {
    setRemovingId(postId);
    const { error } = await supabase
      .from('bookmarks')
      .delete()
      .eq('id', bookmarkId)
      .eq('user_id', userId!);

    if (!error) {
      setBookmarks((prev) => prev.filter((b) => b.id !== bookmarkId));
    }
    setRemovingId(null);
  };

  // Toggle like
  const toggleLike = async (postId: string) => {
    if (!userId) return;
    const isLiked = likedPosts.has(postId);
    if (isLiked) {
      await supabase.from('likes').delete().eq('user_id', userId).eq('post_id', postId);
      setLikedPosts((prev) => { const s = new Set(prev); s.delete(postId); return s; });
    } else {
      await supabase.from('likes').insert({ user_id: userId, post_id: postId });
      setLikedPosts((prev) => new Set([...prev, postId]));
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const clearAllBookmarks = async () => {
    if (!userId || !confirm('Clear all bookmarks?')) return;
    await supabase.from('bookmarks').delete().eq('user_id', userId);
    setBookmarks([]);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-2xl mx-auto border-x border-gray-800 min-h-screen">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-black/80 backdrop-blur-md border-b border-gray-800 px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Bookmarks</h1>
            <p className="text-sm text-gray-500">@{userId ? 'you' : '...'}</p>
          </div>
          {bookmarks.length > 0 && (
            <button
              onClick={clearAllBookmarks}
              className="text-sm text-red-500 hover:text-red-400 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col gap-4 p-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-800" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-800 rounded w-1/3" />
                    <div className="h-4 bg-gray-800 rounded w-full" />
                    <div className="h-4 bg-gray-800 rounded w-2/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : bookmarks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-900 flex items-center justify-center mb-4">
              <Bookmark className="w-8 h-8 text-gray-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Save posts for later</h2>
            <p className="text-gray-500 text-sm max-w-xs">
              Bookmark posts to easily find them again in the future.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {bookmarks.map((bookmark) => {
              const post = bookmark.posts;
              if (!post) return null;
              const user = post.users;
              const isLiked = likedPosts.has(post.id);

              return (
                <article key={bookmark.id} className="px-4 py-4 hover:bg-white/[0.02] transition-colors">
                  <div className="flex gap-3">
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      {user?.avatar_url ? (
                        <img
                          src={user.avatar_url}
                          alt={user.username}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-sm font-bold">
                          {user?.username?.[0]?.toUpperCase() ?? '?'}
                        </div>
                      )}
                    </div>

                    {/* Post Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="font-bold text-sm truncate">
                            {user?.display_name || user?.username}
                          </span>
                          <span className="text-gray-500 text-sm truncate">
                            @{user?.username}
                          </span>
                          <span className="text-gray-600 text-sm flex-shrink-0">·</span>
                          <span className="text-gray-500 text-sm flex-shrink-0">
                            {formatDate(post.created_at)}
                          </span>
                        </div>
                        {/* Remove bookmark */}
                        <button
                          onClick={() => removeBookmark(bookmark.id, post.id)}
                          disabled={removingId === post.id}
                          className="flex-shrink-0 p-1.5 rounded-full hover:bg-red-500/10 text-gray-500 hover:text-red-500 transition-colors"
                          title="Remove bookmark"
                        >
                          {removingId === post.id ? (
                            <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <X className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      {/* Text */}
                      <p className="text-sm mt-1 leading-relaxed whitespace-pre-wrap break-words">
                        {post.text}
                      </p>

                      {/* Image */}
                      {post.image && (
                        <div className="mt-3 rounded-2xl overflow-hidden border border-gray-800">
                          <img
                            src={post.image}
                            alt="Post image"
                            className="w-full max-h-80 object-cover"
                          />
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center justify-between mt-3 text-gray-500 max-w-xs">
                        <button className="flex items-center gap-1.5 hover:text-sky-400 transition-colors group">
                          <div className="p-1.5 rounded-full group-hover:bg-sky-400/10 transition-colors">
                            <MessageCircle className="w-4 h-4" />
                          </div>
                          <span className="text-xs">{post.replies_count || 0}</span>
                        </button>

                        <button className="flex items-center gap-1.5 hover:text-green-400 transition-colors group">
                          <div className="p-1.5 rounded-full group-hover:bg-green-400/10 transition-colors">
                            <Repeat2 className="w-4 h-4" />
                          </div>
                          <span className="text-xs">{post.reposts_count || 0}</span>
                        </button>

                        <button
                          onClick={() => toggleLike(post.id)}
                          className={`flex items-center gap-1.5 transition-colors group ${isLiked ? 'text-pink-500' : 'hover:text-pink-500'}`}
                        >
                          <div className={`p-1.5 rounded-full transition-colors ${isLiked ? 'bg-pink-500/10' : 'group-hover:bg-pink-500/10'}`}>
                            <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
                          </div>
                          <span className="text-xs">{post.likes || 0}</span>
                        </button>

                        <button className="flex items-center gap-1.5 hover:text-sky-400 transition-colors group">
                          <div className="p-1.5 rounded-full group-hover:bg-sky-400/10 transition-colors">
                            <BookmarkCheck className="w-4 h-4 text-sky-400 fill-sky-400" />
                          </div>
                        </button>

                        <button className="flex items-center gap-1.5 hover:text-sky-400 transition-colors group">
                          <div className="p-1.5 rounded-full group-hover:bg-sky-400/10 transition-colors">
                            <Share2 className="w-4 h-4" />
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}