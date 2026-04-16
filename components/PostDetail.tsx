'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { X, Heart, ArrowLeft } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { id } from 'date-fns/locale'

interface Reply {
  id: string
  post_id: string
  user_id: string
  text: string
  likes: number
  created_at: string
  user: {
    username: string
    avatar: string | null
  }
}

interface Post {
  id: string
  user_id: string
  text: string
  image: string | null
  likes: number
  replies_count: number
  created_at: string
  user: {
    username: string
    avatar: string | null
  }
}

interface PostDetailProps {
  post: Post
  currentUser: any
  isLiked: boolean
  onClose: () => void
  onLike: (postId: string, currentLikes: number) => void
  onShowAuth: () => void
}

export default function PostDetail({
  post,
  currentUser,
  isLiked,
  onClose,
  onLike,
  onShowAuth,
}: PostDetailProps) {
  const [replies, setReplies] = useState<Reply[]>([])
  const [replyText, setReplyText] = useState('')
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    fetchReplies()

    // Realtime replies
    const channel = supabase
      .channel(`replies-${post.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'replies', filter: `post_id=eq.${post.id}` },
        () => fetchReplies()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [post.id])

  async function fetchReplies() {
    try {
      const { data, error } = await supabase
        .from('replies')
        .select('*, user:user_id(username, avatar)')
        .eq('post_id', post.id)
        .order('created_at', { ascending: true })

      if (error) throw error
      setReplies(data || [])
    } catch (err) {
      console.error('Error fetching replies:', err)
    } finally {
      setLoading(false)
    }
  }

  async function submitReply() {
    if (!currentUser) {
      onShowAuth()
      return
    }

    if (!replyText.trim()) return

    setPosting(true)
    try {
      const { error } = await supabase.from('replies').insert({
        post_id: post.id,
        user_id: currentUser.id,
        text: replyText.trim(),
      })

      if (error) throw error

      setReplyText('')
      await fetchReplies()
    } catch (err) {
      console.error('Error posting reply:', err)
    } finally {
      setPosting(false)
    }
  }

  async function deleteReply(replyId: string) {
    try {
      const { error } = await supabase
        .from('replies')
        .delete()
        .eq('id', replyId)

      if (error) throw error
      await fetchReplies()
    } catch (err) {
      console.error('Error deleting reply:', err)
    }
  }

  function formatTime(dateStr: string): string {
    try {
      const dateStrFixed = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z'
      const date = new Date(dateStrFixed)
      if (isNaN(date.getTime())) return 'now'
      return formatDistanceToNow(date, { addSuffix: true, locale: id })
    } catch {
      return 'now'
    }
  }

  const userData = Array.isArray(post.user) ? post.user[0] : post.user

  return (
    // Backdrop
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-black border border-gray-800 w-full max-w-[598px] min-h-screen">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-black/85 backdrop-blur-md border-b border-gray-800 flex items-center gap-6 px-4 py-3">
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-900 transition"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-xl font-bold">Post</h2>
        </div>

        {/* Original Post */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex-shrink-0 overflow-hidden">
              {userData?.avatar ? (
                <img src={userData.avatar} alt={userData.username} className="w-full h-full" />
              ) : <span className="flex items-center justify-center w-full h-full">🔥</span>}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1">
                <span className="font-bold text-[15px]">{userData?.username || 'Anonymous'}</span>
                <span className="text-gray-500 text-[15px]">@{userData?.username?.toLowerCase() || 'user'}</span>
              </div>
              <p className="text-[15px] leading-relaxed mt-1 break-words whitespace-pre-wrap">
                {post.text}
              </p>
              {post.image && (
                <div className="mt-3 rounded-2xl overflow-hidden border border-gray-800">
                  <img src={post.image} alt="Post image" className="w-full h-auto object-cover" />
                </div>
              )}
              <p className="text-gray-500 text-[13px] mt-3">
                {formatTime(post.created_at)}
              </p>
            </div>
          </div>

          {/* Post Stats */}
          <div className="flex gap-6 mt-3 pt-3 border-t border-gray-800 text-[15px]">
            <span>
              <strong>{post.replies_count || 0}</strong>
              <span className="text-gray-500 ml-1">Replies</span>
            </span>
            <button
              onClick={() => onLike(post.id, post.likes)}
              className="flex items-center gap-1"
            >
              <strong className={isLiked ? 'text-pink-500' : ''}>{post.likes}</strong>
              <span className="text-gray-500 ml-1">Likes</span>
            </button>
          </div>
        </div>

        {/* Reply Composer */}
        {currentUser && (
          <div className="flex gap-3 p-4 border-b border-gray-800">
            <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden bg-gradient-to-br from-purple-500 to-pink-500">
              {currentUser.avatar ? (
                <img src={currentUser.avatar} alt={currentUser.username} className="w-full h-full" />
              ) : <span className="flex items-center justify-center w-full h-full">🔥</span>}
            </div>
            <div className="flex-1">
              <textarea
                value={replyText}
                onChange={e => {
                  if (e.target.value.length <= 280) setReplyText(e.target.value)
                }}
                className="w-full bg-transparent text-[15px] text-white outline-none resize-none min-h-[80px] placeholder-gray-600"
                placeholder={`Reply to @${userData?.username?.toLowerCase() || 'user'}...`}
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={submitReply}
                  disabled={posting || !replyText.trim()}
                  className="bg-[#1d9bf0] hover:bg-[#1a8cd8] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-[15px] px-5 py-1.5 rounded-full transition"
                >
                  {posting ? 'Replying...' : 'Reply'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Replies List */}
        {loading ? (
          <div className="flex flex-col gap-0">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-3 p-4 border-b border-gray-800 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-gray-800 flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3 bg-gray-800 rounded w-1/4" />
                  <div className="h-3 bg-gray-800 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : replies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-8">
            <p className="text-xl font-bold mb-1">No replies yet</p>
            <p className="text-gray-500 text-[15px]">Be the first to reply!</p>
          </div>
        ) : (
          replies.map(reply => {
            const replyUser = Array.isArray(reply.user) ? reply.user[0] : reply.user
            const isOwner = currentUser?.id === reply.user_id

            return (
              <div
                key={reply.id}
                className="flex gap-3 p-4 border-b border-gray-800 hover:bg-white/[0.03] transition"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex-shrink-0 overflow-hidden">
                  {replyUser?.avatar ? (
                    <img src={replyUser.avatar} alt={replyUser.username} className="w-full h-full" />
                  ) : <span className="flex items-center justify-center w-full h-full">🔥</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="font-bold text-[15px] truncate">
                        {replyUser?.username || 'Anonymous'}
                      </span>
                      <span className="text-gray-500 text-[15px] truncate">
                        @{replyUser?.username?.toLowerCase() || 'user'}
                      </span>
                      <span className="text-gray-500 text-[15px]">·</span>
                      <span className="text-gray-500 text-[15px] flex-shrink-0">
                        {formatTime(reply.created_at)}
                      </span>
                    </div>

                    {/* Delete button - hanya muncul kalau punya reply ini */}
                    {isOwner && (
                      <button
                        onClick={() => deleteReply(reply.id)}
                        className="text-gray-500 hover:text-red-500 p-1 rounded-full transition flex-shrink-0"
                        title="Delete reply"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <p className="text-[15px] leading-relaxed mt-0.5 break-words whitespace-pre-wrap">
                    {reply.text}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}